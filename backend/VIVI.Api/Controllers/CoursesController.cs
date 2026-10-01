using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using VIVI.Api.Auth;
using VIVI.Api.DTOs.Enrollments;
using VIVI.Api.DTOs.Courses;
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
[Route("api/courses")]
public sealed class CoursesController : ControllerBase
{
    private readonly ViviDbContext _db;
    private readonly PricingService _pricing;
    private readonly CustomerResolver _customers;
    private readonly MarketResolver _markets;
    private readonly IBlobStorageService _blob;
    private readonly ILogger<CoursesController> _logger;

    public CoursesController(
        ViviDbContext db,
        PricingService pricing,
        CustomerResolver customers,
        MarketResolver markets,
        IBlobStorageService blob,
        ILogger<CoursesController> logger)
    {
        _db = db;
        _pricing = pricing;
        _customers = customers;
        _markets = markets;
        _blob = blob;
        _logger = logger;
    }

    /// <summary>Lists courses. Customers and anonymous callers only receive published courses.</summary>
    [HttpGet]
    [AllowAnonymous]
    [ProducesResponseType(typeof(IReadOnlyList<CourseResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<CourseResponse>>> List([FromQuery] Guid? categoryId, CancellationToken cancellationToken)
    {
        var admin = User.IsAdmin();
        var query = _db.Courses
            .AsNoTracking()
            .Include(c => c.Category)
            .Include(c => c.Videos)
            .Include(c => c.LaunchOffer)
            .Include(c => c.MarketPrices)
            .Include(c => c.BundleItems)
            .ThenInclude(b => b.IncludedCourse!)
            .ThenInclude(ic => ic.Videos)
            .AsQueryable();

        if (!admin)
            query = query.Where(c => c.Status == CourseStatus.Published);

        if (categoryId.HasValue)
            query = query.Where(c => c.CategoryId == categoryId);

        var items = await query
            .OrderBy(c => c.SortOrder)
            .ThenBy(c => c.Name)
            .ToListAsync(cancellationToken);

        var market = admin ? null : await _markets.ResolveAsync(User, Request, cancellationToken);
        var dtos = items.Select(c => c.ToDto(includeLessons: false, adminView: admin, market: market)).ToList();
        await ResolveThumbnailsAsync(dtos, cancellationToken);
        return Ok(dtos);
    }

    /// <summary>Course detail plus lessons. Draft courses are hidden from non-admins.</summary>
    [HttpGet("{id:guid}")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(CourseResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<CourseResponse>> Get(Guid id, CancellationToken cancellationToken)
    {
        var admin = User.IsAdmin();
        var course = await _db.Courses
            .AsNoTracking()
            .Include(c => c.Category)
            .Include(c => c.Videos)
            .Include(c => c.LaunchOffer)
            .Include(c => c.MarketPrices)
            .Include(c => c.BundleItems)
            .ThenInclude(b => b.IncludedCourse!)
            .ThenInclude(ic => ic.Videos)
            .SingleOrDefaultAsync(c => c.Id == id, cancellationToken);

        if (course is null || (!admin && course.Status != CourseStatus.Published))
            throw ViviException.NotFound("COURSE_NOT_FOUND", "Course was not found.");

        var market = admin ? null : await _markets.ResolveAsync(User, Request, cancellationToken);
        var dto = course.ToDto(includeLessons: true, adminView: admin, market: market);
        await ResolveThumbnailAsync(dto, cancellationToken);
        return Ok(dto);
    }

    /// <summary>
    /// Returns the server-authoritative current price (launch and personal renewal when signed in).
    /// </summary>
    [HttpGet("{id:guid}/pricing")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(CoursePricingResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<CoursePricingResponse>> GetPricing(Guid id, CancellationToken cancellationToken)
    {
        try
        {
            Guid? customerId = null;
            if (User.Identity?.IsAuthenticated == true
                && User.IsInRole(nameof(UserRole.Customer)))
            {
                var customer = await _customers.ResolveForUserAsync(User.GetUserId(), cancellationToken);
                customerId = customer.Id;
            }

            var market = await _markets.ResolveAsync(User, Request, cancellationToken);
            var pricing = await _pricing.GetCoursePricingAsync(id, cancellationToken, customerId, market);
            return Ok(pricing.ToDto());
        }
        catch (KeyNotFoundException)
        {
            throw ViviException.NotFound("COURSE_NOT_FOUND", "Course was not found.");
        }
    }

    /// <summary>Creates a course as Draft. Admin only.</summary>
    [HttpPost]
    [Authorize(Roles = AuthRoles.Console)]
    [ProducesResponseType(typeof(CourseResponse), StatusCodes.Status201Created)]
    public async Task<ActionResult<CourseResponse>> Create([FromBody] CourseRequest request, CancellationToken cancellationToken)
    {
        await EnsureCategory(request.CategoryId, cancellationToken);
        var now = DateTime.UtcNow;
        var course = Apply(new Course
        {
            Id = Guid.NewGuid(),
            Status = CourseStatus.Draft,
            CreatedAt = now,
            CreatedBy = User.GetUserId()
        }, request, now);

        _db.Courses.Add(course);
        await SyncBundleAndLaunchAsync(course, request, now, cancellationToken);
        SyncMarketPrices(course, request, now);
        await _db.SaveChangesAsync(cancellationToken);
        course = await Load(course.Id, cancellationToken);
        var dto = course.ToDto(true, true);
        await ResolveThumbnailAsync(dto, cancellationToken);
        return CreatedAtAction(nameof(Get), new { id = course.Id }, dto);
    }

    /// <summary>Updates course metadata. Does not change publish status. Admin only.</summary>
    [HttpPut("{id:guid}")]
    [Authorize(Roles = AuthRoles.Console)]
    [ProducesResponseType(typeof(CourseResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<CourseResponse>> Update(Guid id, [FromBody] CourseRequest request, CancellationToken cancellationToken)
    {
        var course = await Load(id, cancellationToken);
        await EnsureCategory(request.CategoryId, cancellationToken);
        Apply(course, request, DateTime.UtcNow);
        await SyncBundleAndLaunchAsync(course, request, DateTime.UtcNow, cancellationToken);
        SyncMarketPrices(course, request, DateTime.UtcNow);
        await _db.SaveChangesAsync(cancellationToken);
        course = await Load(id, cancellationToken);
        var dto = course.ToDto(true, true);
        await ResolveThumbnailAsync(dto, cancellationToken);
        return Ok(dto);
    }

    /// <summary>Returns a short-lived write SAS URL for a course thumbnail. Admin only.</summary>
    [HttpPost("{id:guid}/thumbnail-upload-url")]
    [Authorize(Roles = AuthRoles.Console)]
    [ProducesResponseType(typeof(CourseThumbnailUploadUrlResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<CourseThumbnailUploadUrlResponse>> CreateThumbnailUploadUrl(
        Guid id,
        [FromBody] CourseThumbnailUploadUrlRequest request,
        CancellationToken cancellationToken)
    {
        _ = await Load(id, cancellationToken);

        ImageFileRules.Validate(
            request.FileName,
            request.ContentType,
            request.FileSizeBytes,
            ImageFileRules.DefaultMaxBytes);

        var safeName = ImageFileRules.SanitizeFileName(request.FileName);
        var uniqueName = $"{Guid.NewGuid():N}-{safeName}";
        var blobPath = ImageFileRules.BuildCourseThumbnailBlobPath(id, uniqueName);
        var ticket = await _blob.CreateUploadSasAsync(blobPath, request.ContentType.Trim(), cancellationToken);

        return Ok(new CourseThumbnailUploadUrlResponse
        {
            UploadUrl = ticket.UploadUrl,
            ExpiresAt = ticket.ExpiresAt,
            BlobPath = blobPath,
            MaxFileSizeBytes = ImageFileRules.DefaultMaxBytes
        });
    }

    /// <summary>Confirms a finished thumbnail upload and sets it on the course. Admin only.</summary>
    [HttpPost("{id:guid}/thumbnail-upload-complete")]
    [Authorize(Roles = AuthRoles.Console)]
    [ProducesResponseType(typeof(CourseResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<CourseResponse>> CompleteThumbnailUpload(
        Guid id,
        [FromBody] CourseThumbnailUploadCompleteRequest request,
        CancellationToken cancellationToken)
    {
        if (!ImageFileRules.IsOwnedCourseThumbnailPath(id, request.BlobPath))
            throw new ViviException("INVALID_BLOB_PATH", "The blob path does not belong to this course.");

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
            throw ViviException.Conflict(
                "BLOB_MISSING",
                "The image file was not found in storage. Upload it to the SAS URL, then retry.");

        var course = await Load(id, cancellationToken);
        var previous = course.ThumbnailUrl;
        course.ThumbnailUrl = request.BlobPath;
        course.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        if (!string.IsNullOrWhiteSpace(previous)
            && !string.Equals(previous, request.BlobPath, StringComparison.OrdinalIgnoreCase)
            && ProductImageResolver.IsBlobPath(previous))
        {
            try
            {
                await _blob.DeleteAsync(previous, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to delete previous course thumbnail {BlobPath}", previous);
            }
        }

        var dto = course.ToDto(true, true);
        await ResolveThumbnailAsync(dto, cancellationToken);
        return Ok(dto);
    }

    /// <summary>Removes the course thumbnail. Admin only.</summary>
    [HttpDelete("{id:guid}/thumbnail")]
    [Authorize(Roles = AuthRoles.Console)]
    [ProducesResponseType(typeof(CourseResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<CourseResponse>> DeleteThumbnail(Guid id, CancellationToken cancellationToken)
    {
        var course = await Load(id, cancellationToken);
        var previous = course.ThumbnailUrl;
        course.ThumbnailUrl = null;
        course.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        if (!string.IsNullOrWhiteSpace(previous) && ProductImageResolver.IsBlobPath(previous))
        {
            try
            {
                await _blob.DeleteAsync(previous, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to delete course thumbnail {BlobPath}", previous);
            }
        }

        var dto = course.ToDto(true, true);
        await ResolveThumbnailAsync(dto, cancellationToken);
        return Ok(dto);
    }

    /// <summary>Deletes a course and its videos. Admin only.</summary>
    [HttpDelete("{id:guid}")]
    [Authorize(Roles = AuthRoles.Console)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        var course = await Load(id, cancellationToken);

        // Clear Restrict dependents so sold/enrolled courses can still be removed from the catalogue.
        var enrollments = await _db.CourseEnrollments
            .Where(e => e.CourseId == id)
            .ToListAsync(cancellationToken);
        _db.CourseEnrollments.RemoveRange(enrollments);

        var includedInBundles = await _db.CourseBundleItems
            .Where(b => b.IncludedCourseId == id)
            .ToListAsync(cancellationToken);
        _db.CourseBundleItems.RemoveRange(includedInBundles);

        var orderItems = await _db.OrderItems
            .Where(i => i.CourseId == id)
            .ToListAsync(cancellationToken);
        foreach (var item in orderItems)
            item.CourseId = null;

        var blobPaths = course.Videos
            .SelectMany(v => new[] { v.BlobPath, v.ThumbnailBlobPath, v.PatternPdfBlobPath })
            .Append(course.ThumbnailUrl)
            .Where(path => !string.IsNullOrWhiteSpace(path))
            .Select(path => path!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        _db.Courses.Remove(course);
        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex)
        {
            _logger.LogError(ex, "Failed to delete course {CourseId}", id);
            throw ViviException.Conflict(
                "COURSE_DELETE_FAILED",
                "This course could not be deleted because it is still referenced. Try again or contact support.");
        }

        foreach (var blobPath in blobPaths)
        {
            try
            {
                await _blob.DeleteAsync(blobPath, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to delete blob {BlobPath} for course {CourseId}", blobPath, id);
            }
        }

        return NoContent();
    }

    /// <summary>Publishes a course. Requires at least one published or draft video. Admin only.</summary>
    [HttpPost("{id:guid}/publish")]
    [Authorize(Roles = AuthRoles.Console)]
    [ProducesResponseType(typeof(CourseResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<CourseResponse>> Publish(Guid id, CancellationToken cancellationToken)
    {
        var course = await Load(id, cancellationToken);
        if (course.Type == CourseType.Bundle)
        {
            if (course.BundleItems.Count == 0)
                throw ViviException.Conflict("BUNDLE_EMPTY", "Add included courses before publishing this bundle.");
        }
        else if (course.Videos.Count == 0)
        {
            throw ViviException.Conflict("NOTHING_TO_PUBLISH", "Add at least one video before publishing the course.");
        }

        course.Status = CourseStatus.Published;
        course.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        var dto = course.ToDto(true, true);
        await ResolveThumbnailAsync(dto, cancellationToken);
        return Ok(dto);
    }

    /// <summary>Unpublishes a course. Lessons stay as they are. Admin only.</summary>
    [HttpPost("{id:guid}/unpublish")]
    [Authorize(Roles = AuthRoles.Console)]
    [ProducesResponseType(typeof(CourseResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<CourseResponse>> Unpublish(Guid id, CancellationToken cancellationToken)
    {
        var course = await Load(id, cancellationToken);
        course.Status = CourseStatus.Draft;
        course.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        var dto = course.ToDto(true, true);
        await ResolveThumbnailAsync(dto, cancellationToken);
        return Ok(dto);
    }

    private async Task ResolveThumbnailAsync(CourseResponse dto, CancellationToken cancellationToken)
    {
        try
        {
            dto.ThumbnailUrl = await ProductImageResolver.ResolveAsync(dto.ThumbnailUrl, _blob, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to resolve thumbnail for course {CourseId}", dto.Id);
            // Keep listing courses even if SAS/blob resolution fails.
            if (ProductImageResolver.IsBlobPath(dto.ThumbnailUrl))
                dto.ThumbnailUrl = null;
        }
    }

    private async Task ResolveThumbnailsAsync(IReadOnlyList<CourseResponse> dtos, CancellationToken cancellationToken)
    {
        await Task.WhenAll(dtos.Select(dto => ResolveThumbnailAsync(dto, cancellationToken)));
    }

    private async Task<Course> Load(Guid id, CancellationToken cancellationToken)
        => await _db.Courses
               .Include(c => c.Category)
               .Include(c => c.Videos)
               .Include(c => c.LaunchOffer)
               .Include(c => c.MarketPrices)
               .Include(c => c.BundleItems)
               .ThenInclude(b => b.IncludedCourse)
               .SingleOrDefaultAsync(c => c.Id == id, cancellationToken)
           ?? throw ViviException.NotFound("COURSE_NOT_FOUND", "Course was not found.");

    private async Task EnsureCategory(Guid? categoryId, CancellationToken cancellationToken)
    {
        if (!categoryId.HasValue)
            return;

        var exists = await _db.Categories.AnyAsync(c => c.Id == categoryId, cancellationToken);
        if (!exists)
            throw ViviException.NotFound("CATEGORY_NOT_FOUND", "Category was not found.");
    }

    private static Course Apply(Course course, CourseRequest request, DateTime now)
    {
        course.Name = request.Name.Trim();
        course.CategoryId = request.CategoryId;
        course.Type = request.Type;
        course.Level = request.Level?.Trim();
        course.Description = request.Description?.Trim();
        course.About = request.About?.Trim();
        course.Price = request.Price;
        course.Mrp = request.Mrp;
        course.AccessDays = request.AccessDays;
        course.RenewalPercentage = request.RenewalPercentage;
        course.Languages = request.Languages?.Trim();
        course.SortOrder = request.SortOrder;
        course.UpdatedAt = now;
        return course;
    }

    /// <summary>
    /// Saves the per-country prices from the admin form: adds/updates the countries listed and removes
    /// the ones left out (a course with no price in a country cannot be bought there). Null = no change.
    /// </summary>
    private void SyncMarketPrices(Course course, CourseRequest request, DateTime now)
    {
        if (request.MarketPrices is null)
            return;

        var wanted = new Dictionary<string, CoursePriceDto>(StringComparer.Ordinal);
        foreach (var input in request.MarketPrices)
        {
            var country = (input.CountryCode ?? string.Empty).Trim().ToUpperInvariant();
            if (!Markets.PricedCountries.Contains(country))
                throw new ViviException("INVALID_COUNTRY", $"Prices can only be set for: {string.Join(", ", Markets.PricedCountries)}.");
            if (input.Price <= 0 || input.Price > 1_000_000m)
                throw new ViviException("INVALID_PRICE", "Enter a price greater than zero.");
            if (input.Mrp is <= 0 or > 1_000_000m || input.LaunchPrice is <= 0 or > 1_000_000m
                || input.RegularPriceAfterLaunch is <= 0 or > 1_000_000m)
                throw new ViviException("INVALID_PRICE", "Prices must be greater than zero.");
            wanted[country] = input;
        }

        foreach (var existing in course.MarketPrices.Where(p => !wanted.ContainsKey(p.CountryCode)).ToList())
        {
            course.MarketPrices.Remove(existing);
            _db.CoursePrices.Remove(existing);
        }

        foreach (var (country, input) in wanted)
        {
            var row = course.MarketPrices.SingleOrDefault(p => p.CountryCode == country);
            var isNew = row is null;
            row ??= new CoursePrice { Id = Guid.NewGuid(), CourseId = course.Id, CountryCode = country };

            row.Currency = Markets.For(country).Currency;
            row.Price = Math.Round(input.Price, 2, MidpointRounding.AwayFromZero);
            row.Mrp = input.Mrp is decimal mrp ? Math.Round(mrp, 2, MidpointRounding.AwayFromZero) : null;
            // The launch fields only mean something for a bundle with a founding-membership offer.
            var isBundle = course.Type == CourseType.Bundle;
            row.LaunchPrice = isBundle && input.LaunchPrice is decimal lp ? Math.Round(lp, 2, MidpointRounding.AwayFromZero) : null;
            row.RegularPriceAfterLaunch = isBundle && input.RegularPriceAfterLaunch is decimal rp
                ? Math.Round(rp, 2, MidpointRounding.AwayFromZero)
                : null;
            row.UpdatedAt = now;

            if (isNew)
            {
                // Added through the set so it is INSERTed (its key is already set).
                _db.CoursePrices.Add(row);
            }
        }
    }

    private async Task SyncBundleAndLaunchAsync(
        Course course,
        CourseRequest request,
        DateTime now,
        CancellationToken cancellationToken)
    {
        if (course.Type == CourseType.Bundle && request.IncludedCourseIds is not null)
        {
            var ids = request.IncludedCourseIds.Where(id => id != Guid.Empty && id != course.Id).Distinct().ToList();
            if (ids.Count > 0)
            {
                var found = await _db.Courses.CountAsync(c => ids.Contains(c.Id), cancellationToken);
                if (found != ids.Count)
                    throw ViviException.NotFound("COURSE_NOT_FOUND", "One or more included courses were not found.");
            }

            var existing = await _db.CourseBundleItems
                .Where(b => b.BundleCourseId == course.Id)
                .ToListAsync(cancellationToken);
            _db.CourseBundleItems.RemoveRange(existing);

            var sort = 0;
            foreach (var includedId in ids)
            {
                _db.CourseBundleItems.Add(new CourseBundleItem
                {
                    Id = Guid.NewGuid(),
                    BundleCourseId = course.Id,
                    IncludedCourseId = includedId,
                    SortOrder = sort++,
                    CreatedAt = now
                });
            }
        }

        if (course.Type != CourseType.Bundle)
            return;

        var launchPrice = request.LaunchPrice ?? 999;
        var launchLimit = request.LaunchLimit ?? 100;
        var regular = request.RegularPriceAfterLaunch ?? course.Price;
        var mrp = request.Mrp ?? course.Mrp ?? 1997;

        if (course.LaunchOffer is null)
        {
            course.LaunchOffer = new LaunchOfferCounter
            {
                Id = Guid.NewGuid(),
                CourseId = course.Id,
                LaunchLimit = launchLimit,
                LaunchPrice = launchPrice,
                RegularPriceAfterLaunch = regular,
                Mrp = mrp,
                CompletedPurchaseCount = 0,
                CreatedAt = now,
                UpdatedAt = now
            };
            _db.LaunchOfferCounters.Add(course.LaunchOffer);
        }
        else
        {
            course.LaunchOffer.LaunchLimit = launchLimit;
            course.LaunchOffer.LaunchPrice = launchPrice;
            course.LaunchOffer.RegularPriceAfterLaunch = regular;
            course.LaunchOffer.Mrp = mrp;
            course.LaunchOffer.UpdatedAt = now;
        }
    }
}
