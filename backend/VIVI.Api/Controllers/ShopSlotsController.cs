using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VIVI.Api.DTOs.Shop;
using VIVI.Api.Mapping;
using VIVI.Api.Services;
using VIVI.Core.Enums;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Data;

namespace VIVI.Api.Controllers;

/// <summary>Public curated shop slots (an additional layer on top of the category-based catalog).</summary>
[ApiController]
[Route("api/shop/slots")]
public sealed class ShopSlotsController : ControllerBase
{
    private readonly ViviDbContext _db;
    private readonly IBlobStorageService _blob;

    public ShopSlotsController(ViviDbContext db, IBlobStorageService blob)
    {
        _db = db;
        _blob = blob;
    }

    /// <summary>Active slots with their active, published products, in admin-defined order.</summary>
    [HttpGet]
    [AllowAnonymous]
    [ProducesResponseType(typeof(IReadOnlyList<ShopSlotResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<ShopSlotResponse>>> List(
        [FromQuery] ProductType? productType,
        CancellationToken cancellationToken)
    {
        var query = _db.ShopSlots.AsNoTracking()
            .Include(s => s.Products).ThenInclude(l => l.Product!).ThenInclude(p => p.Images)
            .Where(s => s.IsActive);

        if (productType.HasValue)
            query = query.Where(s => s.ProductType == productType.Value);

        var slots = await query
            .OrderBy(s => s.DisplayOrder)
            .ThenBy(s => s.Name)
            .ToListAsync(cancellationToken);

        var dtos = slots
            .Select(s => s.ToDto(adminView: false))
            .Where(d => d.Products.Count > 0)
            .ToList();

        await Task.WhenAll(dtos.SelectMany(d => d.Products).Select(p =>
            ProductImageResolver.ResolveProductAsync(p, _blob, cancellationToken, verifyExists: false)));

        return Ok(dtos);
    }
}
