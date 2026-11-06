using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VIVI.Api.Auth;
using VIVI.Core.Entities;
using VIVI.Infrastructure.Data;

namespace VIVI.Api.Controllers;

public sealed record ShopSettingsResponse(bool HandmadeEnabled, string? DeliveryNotice);

/// <summary>A null field is left unchanged; an empty DeliveryNotice clears it.</summary>
public sealed record ShopSettingsRequest(bool? HandmadeEnabled, string? DeliveryNotice);

/// <summary>Shop switches: the app reads them (no sign-in), the admin dashboard changes them.</summary>
[ApiController]
public sealed class ShopSettingsController : ControllerBase
{
    private readonly ViviDbContext _db;

    public ShopSettingsController(ViviDbContext db) => _db = db;

    /// <summary>No row yet means nothing was ever switched off.</summary>
    [HttpGet("api/shop-settings")]
    [AllowAnonymous]
    public async Task<ActionResult<ShopSettingsResponse>> Get(CancellationToken cancellationToken)
    {
        var settings = await _db.ShopSettings.AsNoTracking().FirstOrDefaultAsync(cancellationToken);
        return Ok(new ShopSettingsResponse(settings?.HandmadeEnabled ?? true, settings?.DeliveryNotice));
    }

    [HttpPut("api/admin/shop-settings")]
    [Authorize(Roles = AuthRoles.Console)]
    public async Task<ActionResult<ShopSettingsResponse>> Update(
        [FromBody] ShopSettingsRequest request,
        CancellationToken cancellationToken)
    {
        var settings = await _db.ShopSettings.FirstOrDefaultAsync(cancellationToken);
        if (settings is null)
        {
            settings = new ShopSettings { Id = Guid.NewGuid() };
            _db.ShopSettings.Add(settings);
        }
        if (request.HandmadeEnabled is { } handmade) settings.HandmadeEnabled = handmade;
        if (request.DeliveryNotice is { } notice)
        {
            notice = notice.Trim();
            if (notice.Length > 500) return BadRequest(new { message = "Delivery notice must be 500 characters or fewer." });
            settings.DeliveryNotice = notice.Length == 0 ? null : notice;
        }
        settings.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        return Ok(new ShopSettingsResponse(settings.HandmadeEnabled, settings.DeliveryNotice));
    }
}
