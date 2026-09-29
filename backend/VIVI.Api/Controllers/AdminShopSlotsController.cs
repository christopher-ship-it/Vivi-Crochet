using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VIVI.Api.Auth;
using VIVI.Api.DTOs.Shop;
using VIVI.Api.Mapping;
using VIVI.Api.Services;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Data;

namespace VIVI.Api.Controllers;

/// <summary>Admin management of shop slots and their ordered product lists.</summary>
[ApiController]
[Route("api/admin/shop/slots")]
[Authorize(Roles = AuthRoles.Console)]
public sealed class AdminShopSlotsController : ControllerBase
{
    private readonly ViviDbContext _db;
    private readonly IBlobStorageService _blob;

    public AdminShopSlotsController(ViviDbContext db, IBlobStorageService blob)
    {
        _db = db;
        _blob = blob;
    }

    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<ShopSlotResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<ShopSlotResponse>>> List(
        [FromQuery] ProductType? productType,
        CancellationToken cancellationToken)
    {
        var query = _db.ShopSlots.AsNoTracking().AsQueryable();
        if (productType.HasValue)
            query = query.Where(s => s.ProductType == productType.Value);

        var slots = await query
            .Include(s => s.Products).ThenInclude(l => l.Product!).ThenInclude(p => p.Images)
            .OrderBy(s => s.ProductType).ThenBy(s => s.DisplayOrder).ThenBy(s => s.Name)
            .ToListAsync(cancellationToken);

        return Ok(await ToResponsesAsync(slots, cancellationToken));
    }

    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(ShopSlotResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<ShopSlotResponse>> Get(Guid id, CancellationToken cancellationToken)
    {
        var slot = await LoadAsync(id, tracking: false, cancellationToken);
        return Ok((await ToResponsesAsync([slot], cancellationToken))[0]);
    }

    [HttpPost]
    [ProducesResponseType(typeof(ShopSlotResponse), StatusCodes.Status201Created)]
    public async Task<ActionResult<ShopSlotResponse>> Create(
        [FromBody] ShopSlotRequest request,
        CancellationToken cancellationToken)
    {
        var name = request.Name.Trim();
        await EnsureNameAvailableAsync(null, name, request.ProductType, cancellationToken);

        var now = DateTime.UtcNow;
        var slot = new ShopSlot
        {
            Id = Guid.NewGuid(),
            Name = name,
            ProductType = request.ProductType,
            DisplayOrder = request.DisplayOrder,
            IsActive = request.IsActive,            CreatedAt = now,
            UpdatedAt = now
        };
        _db.ShopSlots.Add(slot);
        await _db.SaveChangesAsync(cancellationToken);

        var dto = (await ToResponsesAsync([slot], cancellationToken))[0];
        return CreatedAtAction(nameof(Get), new { id = slot.Id }, dto);
    }

    [HttpPut("{id:guid}")]
    [ProducesResponseType(typeof(ShopSlotResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<ShopSlotResponse>> Update(
        Guid id,
        [FromBody] ShopSlotRequest request,
        CancellationToken cancellationToken)
    {
        var slot = await LoadAsync(id, tracking: true, cancellationToken);
        var name = request.Name.Trim();

        if (slot.ProductType != request.ProductType && slot.Products.Count > 0)
        {
            throw ViviException.Conflict(
                "SLOT_HAS_PRODUCTS",
                "Remove the products from this slot before moving it to another room.");
        }

        await EnsureNameAvailableAsync(id, name, request.ProductType, cancellationToken);

        slot.Name = name;
        slot.ProductType = request.ProductType;
        slot.DisplayOrder = request.DisplayOrder;
        slot.IsActive = request.IsActive;        slot.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        return Ok((await ToResponsesAsync([slot], cancellationToken))[0]);
    }

    /// <summary>Deletes the slot and its product references. Catalog products are untouched.</summary>
    [HttpDelete("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        var slot = await LoadAsync(id, tracking: true, cancellationToken);
        _db.ShopSlotProducts.RemoveRange(slot.Products);
        _db.ShopSlots.Remove(slot);
        await _db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    /// <summary>Replaces the slot's complete ordered product list.</summary>
    [HttpPut("{id:guid}/products")]
    [ProducesResponseType(typeof(ShopSlotResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<ShopSlotResponse>> ReplaceProducts(
        Guid id,
        [FromBody] ShopSlotProductsRequest request,
        CancellationToken cancellationToken)
    {
        var slot = await LoadAsync(id, tracking: true, cancellationToken);
        var ids = request.ProductIds ?? Array.Empty<Guid>();
        await ApplyProductListAsync(slot, ids, cancellationToken);
        return Ok((await ToResponsesAsync([slot], cancellationToken))[0]);
    }

    /// <summary>Reorders the existing products; the ids must be exactly the products already in the slot.</summary>
    [HttpPut("{id:guid}/products/order")]
    [ProducesResponseType(typeof(ShopSlotResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<ShopSlotResponse>> Reorder(
        Guid id,
        [FromBody] ShopSlotProductsRequest request,
        CancellationToken cancellationToken)
    {
        var slot = await LoadAsync(id, tracking: true, cancellationToken);
        var ids = request.ProductIds ?? Array.Empty<Guid>();
        var existing = slot.Products.Select(p => p.ProductId).ToHashSet();
        if (ids.Count != existing.Count || !ids.All(existing.Contains))
        {
            throw new ViviException(
                "SLOT_REORDER_MISMATCH",
                "Reorder must list exactly the products already in the slot.");
        }

        await ApplyProductListAsync(slot, ids, cancellationToken);
        return Ok((await ToResponsesAsync([slot], cancellationToken))[0]);
    }

    private async Task ApplyProductListAsync(ShopSlot slot, IReadOnlyList<Guid> ids, CancellationToken cancellationToken)
    {
        if (!slot.IsActive)
        {
            throw ViviException.Conflict(
                "SLOT_INACTIVE",
                "This slot is inactive. Activate it before editing its products.");
        }

        var duplicate = ids.GroupBy(x => x).FirstOrDefault(g => g.Count() > 1);
        if (duplicate is not null)
            throw new ViviException("DUPLICATE_PRODUCT", "A product can only appear once in a slot.");

        var products = await _db.Products
            .Where(p => ids.Contains(p.Id))
            .Select(p => new { p.Id, p.Name, p.ProductType })
            .ToListAsync(cancellationToken);

        if (products.Count != ids.Count)
        {
            throw new ViviException(
                "PRODUCT_NOT_FOUND",
                "One or more products do not exist.");
        }

        var mismatch = products.FirstOrDefault(p => p.ProductType != slot.ProductType);
        if (mismatch is not null)
        {
            var room = slot.ProductType == ProductType.Resell ? "Crochet Essentials" : "Handmade Collection";
            throw new ViviException(
                "PRODUCT_TYPE_MISMATCH",
                $"\"{mismatch.Name}\" cannot be added: this slot only accepts {room} products.");
        }

        var byProduct = slot.Products.ToDictionary(l => l.ProductId);
        foreach (var stale in slot.Products.Where(l => !ids.Contains(l.ProductId)).ToList())
        {
            slot.Products.Remove(stale);
            _db.ShopSlotProducts.Remove(stale);
        }

        for (var i = 0; i < ids.Count; i++)
        {
            if (byProduct.TryGetValue(ids[i], out var link))
            {
                link.DisplayOrder = i;
                link.IsActive = true;
            }
            else
            {
                _db.ShopSlotProducts.Add(new ShopSlotProduct
                {
                    Id = Guid.NewGuid(),
                    SlotId = slot.Id,
                    ProductId = ids[i],
                    DisplayOrder = i,
                    IsActive = true
                });
            }
        }

        slot.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        // Reload so the response reflects persisted rows with their products.
        _db.ChangeTracker.Clear();
        var reloaded = await LoadAsync(slot.Id, tracking: false, cancellationToken);
        slot.Products = reloaded.Products;
    }

    private async Task<ShopSlot> LoadAsync(Guid id, bool tracking, CancellationToken cancellationToken)
    {
        var query = _db.ShopSlots
            .Include(s => s.Products).ThenInclude(l => l.Product!).ThenInclude(p => p.Images)
            .AsQueryable();
        if (!tracking)
            query = query.AsNoTracking();

        return await query.FirstOrDefaultAsync(s => s.Id == id, cancellationToken)
            ?? throw ViviException.NotFound("SLOT_NOT_FOUND", "Slot was not found.");
    }

    private async Task EnsureNameAvailableAsync(
        Guid? slotId,
        string name,
        ProductType productType,
        CancellationToken cancellationToken)
    {
        var upper = name.ToUpperInvariant();
        var taken = await _db.ShopSlots.AnyAsync(
            s => s.Id != slotId && s.ProductType == productType && s.Name.ToUpper() == upper,
            cancellationToken);
        if (taken)
            throw ViviException.Conflict("SLOT_NAME_TAKEN", $"A slot named \"{name}\" already exists in this room.");
    }

    private async Task<IReadOnlyList<ShopSlotResponse>> ToResponsesAsync(
        IReadOnlyList<ShopSlot> slots,
        CancellationToken cancellationToken)
    {
        var dtos = slots.Select(s => s.ToDto(adminView: true)).ToList();
        await Task.WhenAll(dtos.SelectMany(d => d.Products).Select(p =>
            ProductImageResolver.ResolveProductAsync(p, _blob, cancellationToken, verifyExists: false)));
        return dtos;
    }
}
