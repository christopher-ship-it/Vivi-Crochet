using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VIVI.Api.Auth;
using VIVI.Api.DTOs.Products;
using VIVI.Api.Extensions;
using VIVI.Api.Mapping;
using VIVI.Api.Services;
using VIVI.Core;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Commerce;
using VIVI.Infrastructure.Data;

namespace VIVI.Api.Controllers;

[ApiController]
[Route("api/products")]
public sealed class ProductsController : ControllerBase
{
    private readonly ViviDbContext _db;
    private readonly IBlobStorageService _blob;
    private readonly ILogger<ProductsController> _logger;

    public ProductsController(ViviDbContext db, IBlobStorageService blob, ILogger<ProductsController> logger)
    {
        _db = db;
        _blob = blob;
        _logger = logger;
    }

    /// <summary>Lists shop products. Anonymous callers only receive published products.</summary>
    [HttpGet]
    [AllowAnonymous]
    [ProducesResponseType(typeof(IReadOnlyList<ProductResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<ProductResponse>>> List(
        [FromQuery] string? category,
        [FromQuery] string? q,
        [FromQuery] ProductType? productType,
        CancellationToken cancellationToken)
    {
        var admin = User.IsAdmin();
        // Do not Include EssentialLinks here — shop/home list must stay up even if
        // ProductEssentialLinks is missing or bootstrap failed. Cart loads essentials via Get.
        var query = _db.Products
            .AsNoTracking()
            .Include(p => p.Images)
            .Include(p => p.Course!)
            .AsQueryable();

        if (!admin)
            query = query.Where(p => p.Status == ProductStatus.Published);

        if (productType.HasValue)
            query = query.Where(p => p.ProductType == productType.Value);

        if (!string.IsNullOrWhiteSpace(category) && !category.Equals("All", StringComparison.OrdinalIgnoreCase))
            query = query.Where(p => p.Category == category);

        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim();
            query = query.Where(p =>
                p.Name.Contains(term) || p.Category.Contains(term) || (p.Description != null && p.Description.Contains(term)));
        }

        var items = await query
            .OrderBy(p => p.SortOrder)
            .ThenBy(p => p.Name)
            .ToListAsync(cancellationToken);

        items = items
            .OrderBy(p => CategoryShopRank(p.Category))
            .ThenBy(p => p.Category, StringComparer.OrdinalIgnoreCase)
            .ThenBy(p => p.SortOrder)
            .ThenBy(p => p.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var courseIds = items
            .Where(p => p.CourseId.HasValue)
            .Select(p => p.CourseId!.Value)
            .Distinct()
            .ToArray();

        var videoCounts = new Dictionary<Guid, (int Total, int Published)>();
        if (courseIds.Length > 0)
        {
            var rows = await _db.Videos.AsNoTracking()
                .Where(v => courseIds.Contains(v.CourseId))
                .GroupBy(v => v.CourseId)
                .Select(g => new
                {
                    CourseId = g.Key,
                    Total = g.Count(),
                    Published = g.Count(v => v.Status == VideoStatus.Published)
                })
                .ToListAsync(cancellationToken);

            foreach (var row in rows)
                videoCounts[row.CourseId] = (row.Total, row.Published);
        }

        var dtos = items
            .Select(product =>
            {
                int? videoCount = null;
                if (product.CourseId is Guid courseId && videoCounts.TryGetValue(courseId, out var counts))
                    videoCount = admin ? counts.Total : counts.Published;
                return product.ToDto(adminView: admin, videoCount);
            })
            .ToList();

        // Skip blob HEAD checks on list — SAS only (avoids N Azure round-trips per image).
        await Task.WhenAll(dtos.Select(dto =>
            ProductImageResolver.ResolveProductAsync(dto, _blob, cancellationToken, verifyExists: false)));

        return Ok(dtos);
    }

    /// <summary>Returns shop categories that have at least one visible product.</summary>
    [HttpGet("categories")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(IReadOnlyList<string>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<string>>> Categories(
        [FromQuery] ProductType? productType,
        CancellationToken cancellationToken)
    {
        var admin = User.IsAdmin();
        var query = _db.Products.AsNoTracking().AsQueryable();
        if (!admin)
            query = query.Where(p => p.Status == ProductStatus.Published);

        if (productType.HasValue)
            query = query.Where(p => p.ProductType == productType.Value);

        var categories = await query
            .Select(p => p.Category)
            .Distinct()
            .OrderBy(c => c)
            .ToListAsync(cancellationToken);

        return Ok(categories);
    }

    /// <summary>Product detail with optional linked Learn &amp; Loop course.</summary>
    [HttpGet("{id:guid}")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(ProductResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<ProductResponse>> Get(Guid id, CancellationToken cancellationToken)
    {
        var admin = User.IsAdmin();
        var product = await LoadProductForReadAsync(id, includeEssentials: true, cancellationToken);

        if (product is null)
        {
            // Retry without essentials if ProductEssentialLinks is unavailable.
            product = await LoadProductForReadAsync(id, includeEssentials: false, cancellationToken);
        }

        if (product is null || (!admin && product.Status != ProductStatus.Published))
            throw ViviException.NotFound("PRODUCT_NOT_FOUND", "Product was not found.");

        var dto = product.ToDto(adminView: admin);
        await ProductImageResolver.ResolveProductAsync(dto, _blob, cancellationToken);
        return Ok(dto);
    }

    private async Task<Product?> LoadProductForReadAsync(
        Guid id,
        bool includeEssentials,
        CancellationToken cancellationToken)
    {
        try
        {
            IQueryable<Product> query = _db.Products
                .AsNoTracking()
                .Include(p => p.Images)
                .Include(p => p.Course!)
                .ThenInclude(c => c.Videos);

            if (includeEssentials)
            {
                query = query
                    .AsSplitQuery()
                    .Include(p => p.EssentialLinks)
                    .ThenInclude(l => l.EssentialProduct);
            }

            return await query.SingleOrDefaultAsync(p => p.Id == id, cancellationToken);
        }
        catch (Exception ex) when (includeEssentials)
        {
            // Missing ProductEssentialLinks table (or related schema) must not take detail down.
            _logger.LogWarning(ex, "Product {ProductId} essentials include failed; retrying without links.", id);
            return null;
        }
    }

    /// <summary>Creates a product as Draft. Admin only.</summary>
    [HttpPost]
    [Authorize(Roles = AuthRoles.Console)]
    [ProducesResponseType(typeof(ProductResponse), StatusCodes.Status201Created)]
    public async Task<ActionResult<ProductResponse>> Create([FromBody] ProductRequest request, CancellationToken cancellationToken)
    {
        await EnsureCourse(request.CourseId, cancellationToken);
        var now = DateTime.UtcNow;
        var product = Apply(new Product
        {
            Id = Guid.NewGuid(),
            Status = ProductStatus.Draft,
            CreatedAt = now
        }, request, now);

        _db.Products.Add(product);
        await _db.SaveChangesAsync(cancellationToken);
        await SyncEssentialLinks(product, request, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
        await LoadCourseNav(product, cancellationToken);
        await LoadEssentialNav(product, cancellationToken);

        var dto = product.ToDto(adminView: true);
        await ProductImageResolver.ResolveProductAsync(dto, _blob, cancellationToken);
        return CreatedAtAction(nameof(Get), new { id = product.Id }, dto);
    }

    /// <summary>Updates product metadata. Does not change publish status. Admin only.</summary>
    [HttpPut("{id:guid}")]
    [Authorize(Roles = AuthRoles.Console)]
    [ProducesResponseType(typeof(ProductResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<ProductResponse>> Update(
        Guid id,
        [FromBody] ProductRequest request,
        CancellationToken cancellationToken)
    {
        var product = await Load(id, cancellationToken);
        await EnsureCourse(request.CourseId, cancellationToken);
        Apply(product, request, DateTime.UtcNow);
        await SyncEssentialLinks(product, request, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
        await LoadEssentialNav(product, cancellationToken);

        var dto = product.ToDto(adminView: true);
        await ProductImageResolver.ResolveProductAsync(dto, _blob, cancellationToken);
        return Ok(dto);
    }

    /// <summary>Deletes a product and its image blobs. Admin only.</summary>
    [HttpDelete("{id:guid}")]
    [Authorize(Roles = AuthRoles.Console)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        var product = await Load(id, cancellationToken);
        var blobPaths = product.Images
            .Select(i => i.BlobPath)
            .Concat(string.IsNullOrWhiteSpace(product.ImageUrl) ? [] : [product.ImageUrl!])
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Where(ProductImageResolver.IsBlobPath)
            .ToList();

        var orderItems = await _db.OrderItems
            .Where(i => i.ProductId == id)
            .ToListAsync(cancellationToken);
        foreach (var item in orderItems)
            item.ProductId = null;

        try
        {
            var links = await _db.ProductEssentialLinks
                .Where(l => l.SourceProductId == id || l.EssentialProductId == id)
                .ToListAsync(cancellationToken);
            _db.ProductEssentialLinks.RemoveRange(links);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not clear essential links before deleting product {ProductId}.", id);
        }

        _db.Products.Remove(product);
        await _db.SaveChangesAsync(cancellationToken);

        foreach (var path in blobPaths)
            await _blob.DeleteAsync(path, cancellationToken);

        return NoContent();
    }

    /// <summary>Publishes a product. Admin only.</summary>
    [HttpPost("{id:guid}/publish")]
    [Authorize(Roles = AuthRoles.Console)]
    [ProducesResponseType(typeof(ProductResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<ProductResponse>> Publish(Guid id, CancellationToken cancellationToken)
    {
        var product = await Load(id, cancellationToken);
        product.Status = ProductStatus.Published;
        product.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        var dto = product.ToDto(adminView: true);
        await ProductImageResolver.ResolveProductAsync(dto, _blob, cancellationToken);
        return Ok(dto);
    }

    /// <summary>Unpublishes a product. Admin only.</summary>
    [HttpPost("{id:guid}/unpublish")]
    [Authorize(Roles = AuthRoles.Console)]
    [ProducesResponseType(typeof(ProductResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<ProductResponse>> Unpublish(Guid id, CancellationToken cancellationToken)
    {
        var product = await Load(id, cancellationToken);
        product.Status = ProductStatus.Draft;
        product.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        var dto = product.ToDto(adminView: true);
        await ProductImageResolver.ResolveProductAsync(dto, _blob, cancellationToken);
        return Ok(dto);
    }

    /// <summary>
    /// Returns a short-lived write SAS URL for a product image.
    /// Upload the file directly to blob storage, then call image-upload-complete. Admin only.
    /// </summary>
    [HttpPost("{id:guid}/image-upload-url")]
    [Authorize(Roles = AuthRoles.Console)]
    [ProducesResponseType(typeof(ProductImageUploadUrlResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<ProductImageUploadUrlResponse>> CreateImageUploadUrl(
        Guid id,
        [FromBody] ProductImageUploadUrlRequest request,
        CancellationToken cancellationToken)
    {
        var product = await Load(id, cancellationToken, tracking: false);
        if (product.Images.Count >= ImageFileRules.MaxImagesPerProduct)
        {
            throw ViviException.Conflict(
                "IMAGE_LIMIT",
                $"A product can have at most {ImageFileRules.MaxImagesPerProduct} photos.");
        }

        ImageFileRules.Validate(
            request.FileName,
            request.ContentType,
            request.FileSizeBytes,
            ImageFileRules.DefaultMaxBytes);

        var safeName = ImageFileRules.SanitizeFileName(request.FileName);
        var uniqueName = $"{Guid.NewGuid():N}-{safeName}";
        var blobPath = ImageFileRules.BuildBlobPath(id, uniqueName);

        var ticket = await _blob.CreateUploadSasAsync(blobPath, request.ContentType.Trim(), cancellationToken);

        return Ok(new ProductImageUploadUrlResponse
        {
            UploadUrl = ticket.UploadUrl,
            ExpiresAt = ticket.ExpiresAt,
            BlobPath = blobPath,
            MaxFileSizeBytes = ImageFileRules.DefaultMaxBytes
        });
    }

    /// <summary>Confirms a finished image upload and adds it to the product gallery. Admin only.</summary>
    [HttpPost("{id:guid}/image-upload-complete")]
    [Authorize(Roles = AuthRoles.Console)]
    [ProducesResponseType(typeof(ProductResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<ProductResponse>> CompleteImageUpload(
        Guid id,
        [FromBody] ProductImageUploadCompleteRequest request,
        CancellationToken cancellationToken)
    {
        if (!ImageFileRules.IsOwnedBlobPath(id, request.BlobPath))
            throw new ViviException("INVALID_BLOB_PATH", "The blob path does not belong to this product.");

        ImageFileRules.Validate(
            Path.GetFileName(request.BlobPath),
            request.ContentType,
            request.FileSizeBytes,
            ImageFileRules.DefaultMaxBytes);

        var completed = await _blob.TryCompleteUploadAsync(
            request.BlobPath,
            request.FileSizeBytes,
            request.ContentType.Trim(),
            cancellationToken);

        if (!completed)
            throw ViviException.Conflict("BLOB_MISSING", "The image file was not found in storage. Upload it to the SAS URL, then retry.");

        var product = await Load(id, cancellationToken);
        if (product.Images.Count >= ImageFileRules.MaxImagesPerProduct)
        {
            await _blob.DeleteAsync(request.BlobPath, cancellationToken);
            throw ViviException.Conflict(
                "IMAGE_LIMIT",
                $"A product can have at most {ImageFileRules.MaxImagesPerProduct} photos.");
        }

        var makeMain = request.SetAsMain || product.Images.Count == 0 || !product.Images.Any(i => i.IsMain);
        if (makeMain)
        {
            foreach (var existing in product.Images.Where(i => i.IsMain))
                existing.IsMain = false;
        }

        var nextSort = product.Images.Count == 0 ? 0 : product.Images.Max(i => i.SortOrder) + 1;
        var image = new ProductImage
        {
            Id = Guid.NewGuid(),
            ProductId = product.Id,
            BlobPath = request.BlobPath,
            SortOrder = nextSort,
            IsMain = makeMain,
            CreatedAt = DateTime.UtcNow
        };

        product.Images.Add(image);

        // The Guid key is already set, so change detection alone would treat this as an
        // existing row and emit an UPDATE. Add through the set to force an INSERT.
        _db.ProductImages.Add(image);

        SyncMainImageUrl(product);
        product.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        var dto = product.ToDto(adminView: true);
        await ProductImageResolver.ResolveProductAsync(dto, _blob, cancellationToken);
        return Ok(dto);
    }

    /// <summary>Marks one gallery image as the main shop image. Admin only.</summary>
    [HttpPost("{id:guid}/images/{imageId:guid}/set-main")]
    [Authorize(Roles = AuthRoles.Console)]
    [ProducesResponseType(typeof(ProductResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<ProductResponse>> SetMainImage(
        Guid id,
        Guid imageId,
        CancellationToken cancellationToken)
    {
        var product = await Load(id, cancellationToken);
        var image = product.Images.SingleOrDefault(i => i.Id == imageId)
            ?? throw ViviException.NotFound("PRODUCT_IMAGE_NOT_FOUND", "Product image was not found.");

        foreach (var existing in product.Images)
            existing.IsMain = existing.Id == image.Id;

        SyncMainImageUrl(product);
        product.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        var dto = product.ToDto(adminView: true);
        await ProductImageResolver.ResolveProductAsync(dto, _blob, cancellationToken);
        return Ok(dto);
    }

    /// <summary>Removes one gallery image. Admin only.</summary>
    [HttpDelete("{id:guid}/images/{imageId:guid}")]
    [Authorize(Roles = AuthRoles.Console)]
    [ProducesResponseType(typeof(ProductResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<ProductResponse>> DeleteImage(
        Guid id,
        Guid imageId,
        CancellationToken cancellationToken)
    {
        var product = await Load(id, cancellationToken);
        var image = product.Images.SingleOrDefault(i => i.Id == imageId)
            ?? throw ViviException.NotFound("PRODUCT_IMAGE_NOT_FOUND", "Product image was not found.");

        var blobPath = image.BlobPath;
        var wasMain = image.IsMain;
        product.Images.Remove(image);
        _db.ProductImages.Remove(image);

        if (wasMain)
        {
            var nextMain = product.Images
                .OrderBy(i => i.SortOrder)
                .ThenBy(i => i.CreatedAt)
                .FirstOrDefault();
            if (nextMain is not null)
                nextMain.IsMain = true;
        }

        SyncMainImageUrl(product);
        product.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        if (ProductImageResolver.IsBlobPath(blobPath))
            await _blob.DeleteAsync(blobPath, cancellationToken);

        var dto = product.ToDto(adminView: true);
        await ProductImageResolver.ResolveProductAsync(dto, _blob, cancellationToken);
        return Ok(dto);
    }

    private static int CategoryShopRank(string category)
    {
        var key = category.Trim().ToLowerInvariant();
        if (key.Contains("t-shirt") || key.Contains("tshirt") || key.Contains("t shirt"))
            return 0;
        if (key.Contains("rose"))
            return 1;
        return 50;
    }

    private static void SyncMainImageUrl(Product product)
    {
        var main = product.Images.FirstOrDefault(i => i.IsMain)
                   ?? product.Images.OrderBy(i => i.SortOrder).FirstOrDefault();
        product.ImageUrl = main?.BlobPath;
    }

    private async Task<Product> Load(Guid id, CancellationToken cancellationToken, bool tracking = true)
    {
        var query = tracking ? _db.Products.AsQueryable() : _db.Products.AsNoTracking();
        try
        {
            var withLinks = await query
                .AsSplitQuery()
                .Include(p => p.Images)
                .Include(p => p.Course!)
                .ThenInclude(c => c.Videos)
                .Include(p => p.EssentialLinks)
                    .ThenInclude(l => l.EssentialProduct)
                .SingleOrDefaultAsync(p => p.Id == id, cancellationToken);

            if (withLinks is not null)
                return withLinks;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Product {ProductId} load with essentials failed; retrying without links.", id);
        }

        var product = await query
            .Include(p => p.Images)
            .Include(p => p.Course!)
            .ThenInclude(c => c.Videos)
            .SingleOrDefaultAsync(p => p.Id == id, cancellationToken);

        return product ?? throw ViviException.NotFound("PRODUCT_NOT_FOUND", "Product was not found.");
    }

    private async Task LoadCourseNav(Product product, CancellationToken cancellationToken)
    {
        if (!product.CourseId.HasValue)
            return;

        await _db.Entry(product).Reference(p => p.Course).LoadAsync(cancellationToken);
        if (product.Course is not null)
            await _db.Entry(product.Course).Collection(c => c.Videos).LoadAsync(cancellationToken);
    }

    private async Task LoadEssentialNav(Product product, CancellationToken cancellationToken)
    {
        try
        {
            await _db.Entry(product).Collection(p => p.EssentialLinks).LoadAsync(cancellationToken);
            foreach (var link in product.EssentialLinks)
                await _db.Entry(link).Reference(l => l.EssentialProduct).LoadAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not load essential links for product {ProductId}.", product.Id);
            product.EssentialLinks = new List<ProductEssentialLink>();
        }
    }

    private async Task SyncEssentialLinks(Product product, ProductRequest request, CancellationToken cancellationToken)
    {
        // Production may not have run the EF migration yet — create the table on demand.
        await ProductEssentialSchemaBootstrapper.EnsureAsync(_db, cancellationToken, _logger);

        List<ProductEssentialLink> existing;
        try
        {
            existing = await _db.ProductEssentialLinks
                .Where(l => l.SourceProductId == product.Id)
                .ToListAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "ProductEssentialLinks unavailable when syncing product {ProductId}.", product.Id);
            throw new ViviException(
                "ESSENTIAL_LINKS_UNAVAILABLE",
                "Could not save recommended essentials. Redeploy after ProductEssentialLinks schema is ready.",
                503);
        }

        _db.ProductEssentialLinks.RemoveRange(existing);

        if (request.ProductType != ProductType.Handmade)
            return;

        var ids = (request.RecommendedEssentialIds ?? Array.Empty<Guid>())
            .Where(id => id != Guid.Empty && id != product.Id)
            .Distinct()
            .Take(3)
            .ToArray();
        if (ids.Length == 0)
            return;

        var validIds = await _db.Products
            .Where(p => ids.Contains(p.Id) && p.ProductType == ProductType.Resell)
            .Select(p => p.Id)
            .ToListAsync(cancellationToken);

        var ordered = ids.Where(id => validIds.Contains(id)).ToArray();
        for (var i = 0; i < ordered.Length; i++)
        {
            _db.ProductEssentialLinks.Add(new ProductEssentialLink
            {
                Id = Guid.NewGuid(),
                SourceProductId = product.Id,
                EssentialProductId = ordered[i],
                SortOrder = i
            });
        }
    }

    private async Task EnsureCourse(Guid? courseId, CancellationToken cancellationToken)
    {
        if (!courseId.HasValue)
            return;

        var exists = await _db.Courses.AnyAsync(c => c.Id == courseId, cancellationToken);
        if (!exists)
            throw ViviException.NotFound("COURSE_NOT_FOUND", "Course was not found.");
    }

    private static Product Apply(Product product, ProductRequest request, DateTime now)
    {
        product.Name = request.Name.Trim();
        product.Category = request.Category.Trim();
        product.Description = request.Description?.Trim();
        product.Price = request.Price;
        product.Mrp = request.Mrp;
        product.Spec1 = request.Spec1?.Trim();
        product.Spec2 = request.Spec2?.Trim();
        product.CourseId = request.ProductType == ProductType.Handmade ? request.CourseId : null;
        product.SortOrder = request.SortOrder;
        product.ProductType = request.ProductType;
        product.AvailableStock = request.AvailableStock;
        product.UpdatedAt = now;
        return product;
    }
}
