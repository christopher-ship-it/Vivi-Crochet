using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VIVI.Api.Auth;
using VIVI.Api.DTOs.AppHealth;
using VIVI.Api.Mapping;
using VIVI.Core.Entities;
using VIVI.Core.Exceptions;
using VIVI.Infrastructure.Data;

namespace VIVI.Api.Controllers;

[ApiController]
[Route("api/admin/app-health")]
[Authorize(Roles = AuthRoles.Console)]
public sealed class AdminAppHealthController : ControllerBase
{
    private readonly ViviDbContext _db;

    public AdminAppHealthController(ViviDbContext db) => _db = db;

    [HttpGet("summary")]
    public async Task<ActionResult<AppHealthSummaryResponse>> Summary(CancellationToken cancellationToken)
    {
        var weekAgo = DateTime.UtcNow.AddDays(-7);
        var issues = _db.AppIssues.AsNoTracking();

        return Ok(new AppHealthSummaryResponse
        {
            OpenCrashes = await issues.CountAsync(i => i.Kind == AppIssueKinds.Crash && !i.IsResolved, cancellationToken),
            OpenBugs = await issues.CountAsync(i => i.Kind == AppIssueKinds.Bug && !i.IsResolved, cancellationToken),
            CrashesLast7Days = await issues.CountAsync(i => i.Kind == AppIssueKinds.Crash && i.CreatedAt >= weekAgo, cancellationToken),
            BugsLast7Days = await issues.CountAsync(i => i.Kind == AppIssueKinds.Bug && i.CreatedAt >= weekAgo, cancellationToken),
            OpenBuffering = await issues.CountAsync(i => i.Kind == AppIssueKinds.Buffering && !i.IsResolved, cancellationToken),
            BufferingLast7Days = await issues.CountAsync(i => i.Kind == AppIssueKinds.Buffering && i.CreatedAt >= weekAgo, cancellationToken),
            TotalTaps = await _db.ScreenTapCells.AsNoTracking().SumAsync(c => (long?)c.Taps, cancellationToken) ?? 0
        });
    }

    /// <param name="kind">Optional: Crash or Bug.</param>
    /// <param name="status">Optional: open or resolved.</param>
    [HttpGet("issues")]
    public async Task<ActionResult<IReadOnlyList<AdminAppIssueResponse>>> ListIssues(
        [FromQuery] string? kind,
        [FromQuery] string? status,
        CancellationToken cancellationToken)
    {
        var query = _db.AppIssues.AsNoTracking().AsQueryable();
        if (AppIssueKinds.IsValid(kind))
            query = query.Where(i => i.Kind == kind);
        if (string.Equals(status, "open", StringComparison.OrdinalIgnoreCase))
            query = query.Where(i => !i.IsResolved);
        else if (string.Equals(status, "resolved", StringComparison.OrdinalIgnoreCase))
            query = query.Where(i => i.IsResolved);

        var rows = await query
            .OrderByDescending(i => i.CreatedAt)
            .Take(500)
            .ToListAsync(cancellationToken);

        var userIds = rows.Where(r => r.UserId.HasValue).Select(r => r.UserId!.Value).Distinct().ToList();
        var customers = await _db.Customers
            .AsNoTracking()
            .Where(c => userIds.Contains(c.UserId))
            .ToListAsync(cancellationToken);
        var byUser = customers.GroupBy(c => c.UserId).ToDictionary(g => g.Key, g => g.First());

        return Ok(rows.Select(r =>
        {
            byUser.TryGetValue(r.UserId ?? Guid.Empty, out var customer);
            return new AdminAppIssueResponse
            {
                Id = r.Id,
                Kind = r.Kind,
                Title = r.Title,
                Details = r.Details,
                Screen = r.Screen,
                AppVersion = r.AppVersion,
                Platform = r.Platform,
                DeviceInfo = r.DeviceInfo,
                IsFatal = r.IsFatal,
                CustomerName = customer is null ? string.Empty : CommerceMapper.DisplayCustomerName(customer),
                PhoneNumber = customer?.PhoneNumber ?? string.Empty,
                CreatedAt = r.CreatedAt,
                IsResolved = r.IsResolved,
                ResolvedAt = r.ResolvedAt
            };
        }).ToList());
    }

    [HttpPost("issues/{id:guid}/resolve")]
    public Task<IActionResult> Resolve(Guid id, CancellationToken cancellationToken) =>
        SetResolved(id, true, cancellationToken);

    [HttpPost("issues/{id:guid}/reopen")]
    public Task<IActionResult> Reopen(Guid id, CancellationToken cancellationToken) =>
        SetResolved(id, false, cancellationToken);

    [HttpGet("heatmap/screens")]
    public async Task<ActionResult<IReadOnlyList<HeatmapScreenResponse>>> HeatmapScreens(
        CancellationToken cancellationToken)
    {
        var rows = await _db.ScreenTapCells
            .AsNoTracking()
            .GroupBy(c => c.Screen)
            .Select(g => new HeatmapScreenResponse { Screen = g.Key, Taps = g.Sum(c => c.Taps) })
            .OrderByDescending(s => s.Taps)
            .ToListAsync(cancellationToken);
        return Ok(rows);
    }

    [HttpGet("heatmap")]
    public async Task<ActionResult<HeatmapResponse>> Heatmap(
        [FromQuery] string screen,
        CancellationToken cancellationToken)
    {
        var cells = await _db.ScreenTapCells
            .AsNoTracking()
            .Where(c => c.Screen == screen)
            .ToListAsync(cancellationToken);

        return Ok(new HeatmapResponse
        {
            Screen = screen,
            Columns = ScreenTapCell.GridColumns,
            Rows = ScreenTapCell.GridRows,
            TotalTaps = cells.Sum(c => c.Taps),
            MaxCellTaps = cells.Count == 0 ? 0 : cells.Max(c => c.Taps),
            Cells = cells.Select(c => new TapCellDto { Col = c.Col, Row = c.Row, Taps = c.Taps }).ToList()
        });
    }

    [HttpDelete("heatmap")]
    public async Task<IActionResult> ResetHeatmap([FromQuery] string screen, CancellationToken cancellationToken)
    {
        await _db.ScreenTapCells.Where(c => c.Screen == screen).ExecuteDeleteAsync(cancellationToken);
        return NoContent();
    }

    private async Task<IActionResult> SetResolved(Guid id, bool resolved, CancellationToken cancellationToken)
    {
        var issue = await _db.AppIssues.SingleOrDefaultAsync(i => i.Id == id, cancellationToken)
            ?? throw ViviException.NotFound("APP_ISSUE_NOT_FOUND", "Issue was not found.");

        if (issue.IsResolved != resolved)
        {
            issue.IsResolved = resolved;
            issue.ResolvedAt = resolved ? DateTime.UtcNow : null;
            await _db.SaveChangesAsync(cancellationToken);
        }

        return NoContent();
    }
}
