using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using VIVI.Api.DTOs.AppHealth;
using VIVI.Core.Entities;
using VIVI.Infrastructure.Data;

namespace VIVI.Api.Controllers;

/// <summary>
/// Crash/bug reports and screen-tap batches from the mobile app. Anonymous on purpose:
/// crashes can happen before sign-in. Payload sizes are validated and the route is rate limited.
/// </summary>
[ApiController]
[Route("api/app-telemetry")]
[AllowAnonymous]
[EnableRateLimiting("telemetry")]
public sealed class AppTelemetryController : ControllerBase
{
    private readonly ViviDbContext _db;

    public AppTelemetryController(ViviDbContext db) => _db = db;

    [HttpPost("issues")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> ReportIssue(
        [FromBody] ReportAppIssueRequest request,
        CancellationToken cancellationToken)
    {
        _db.AppIssues.Add(new AppIssue
        {
            Id = Guid.NewGuid(),
            UserId = TryGetUserId(),
            Kind = request.Kind,
            Title = request.Title.Trim(),
            Details = request.Details,
            Screen = request.Screen?.Trim(),
            AppVersion = request.AppVersion?.Trim(),
            Platform = request.Platform?.Trim(),
            DeviceInfo = request.DeviceInfo?.Trim(),
            IsFatal = request.IsFatal,
            CreatedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpPost("taps")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> ReportTaps(
        [FromBody] ReportTapsRequest request,
        CancellationToken cancellationToken)
    {
        var screen = request.Screen.Trim();
        var now = DateTime.UtcNow;

        // Merge duplicate cells in the payload, then upsert against existing rows.
        var incoming = request.Cells
            .GroupBy(c => (c.Col, c.Row))
            .ToDictionary(g => g.Key, g => g.Sum(c => c.Taps));

        var existing = await _db.ScreenTapCells
            .Where(c => c.Screen == screen)
            .ToListAsync(cancellationToken);
        var byKey = existing.ToDictionary(c => (c.Col, c.Row));

        foreach (var ((col, row), taps) in incoming)
        {
            if (byKey.TryGetValue((col, row), out var cell))
            {
                cell.Taps += taps;
                cell.UpdatedAt = now;
            }
            else
            {
                _db.ScreenTapCells.Add(new ScreenTapCell
                {
                    Id = Guid.NewGuid(),
                    Screen = screen,
                    Col = col,
                    Row = row,
                    Taps = taps,
                    UpdatedAt = now
                });
            }
        }

        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // Two devices created the same new cell at once (unique index). Heatmap data is
            // best-effort, so drop this batch rather than failing the app.
        }

        return NoContent();
    }

    private Guid? TryGetUserId()
    {
        var value = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        return Guid.TryParse(value, out var id) ? id : null;
    }
}
