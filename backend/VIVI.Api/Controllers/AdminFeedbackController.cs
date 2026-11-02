using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VIVI.Api.Auth;
using VIVI.Api.DTOs.Feedback;
using VIVI.Core.Exceptions;
using VIVI.Infrastructure.Data;

namespace VIVI.Api.Controllers;

[ApiController]
[Route("api/admin/feedback")]
[Authorize(Roles = AuthRoles.Console)]
public sealed class AdminFeedbackController : ControllerBase
{
    private readonly ViviDbContext _db;

    public AdminFeedbackController(ViviDbContext db) => _db = db;

    [HttpGet("summary")]
    public async Task<ActionResult<AdminFeedbackSummaryResponse>> Summary(CancellationToken cancellationToken)
    {
        var weekAgo = DateTime.UtcNow.AddDays(-7);
        var all = _db.AppFeedbacks.AsNoTracking();
        return Ok(new AdminFeedbackSummaryResponse
        {
            Total = await all.CountAsync(cancellationToken),
            Last7Days = await all.CountAsync(f => f.CreatedAt >= weekAgo, cancellationToken),
            Unresolved = await all.CountAsync(f => !f.IsResolved, cancellationToken)
        });
    }

    /// <param name="status">Optional: open or resolved.</param>
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<AdminFeedbackItemResponse>>> List(
        [FromQuery] string? status,
        CancellationToken cancellationToken)
    {
        var query = _db.AppFeedbacks.AsNoTracking().AsQueryable();
        if (string.Equals(status, "open", StringComparison.OrdinalIgnoreCase)) query = query.Where(f => !f.IsResolved);
        else if (string.Equals(status, "resolved", StringComparison.OrdinalIgnoreCase)) query = query.Where(f => f.IsResolved);

        var items = await query
            .OrderByDescending(f => f.CreatedAt)
            .Take(300)
            .Select(f => new AdminFeedbackItemResponse
            {
                Id = f.Id,
                Message = f.Message,
                Screen = f.Screen,
                AppVersion = f.AppVersion,
                Platform = f.Platform,
                SecondsInApp = f.SecondsInApp,
                CreatedAt = f.CreatedAt,
                IsResolved = f.IsResolved,
                ResolvedAt = f.ResolvedAt
            })
            .ToListAsync(cancellationToken);
        return Ok(items);
    }

    [HttpPut("{id:guid}/resolved")]
    public async Task<ActionResult<AdminFeedbackItemResponse>> SetResolved(
        Guid id,
        [FromQuery] bool resolved,
        CancellationToken cancellationToken)
    {
        var item = await _db.AppFeedbacks.SingleOrDefaultAsync(f => f.Id == id, cancellationToken)
            ?? throw ViviException.NotFound("FEEDBACK_NOT_FOUND", "Feedback was not found.");
        item.IsResolved = resolved;
        item.ResolvedAt = resolved ? DateTime.UtcNow : null;
        await _db.SaveChangesAsync(cancellationToken);
        return Ok(new AdminFeedbackItemResponse
        {
            Id = item.Id,
            Message = item.Message,
            Screen = item.Screen,
            AppVersion = item.AppVersion,
            Platform = item.Platform,
            SecondsInApp = item.SecondsInApp,
            CreatedAt = item.CreatedAt,
            IsResolved = item.IsResolved,
            ResolvedAt = item.ResolvedAt
        });
    }
}
