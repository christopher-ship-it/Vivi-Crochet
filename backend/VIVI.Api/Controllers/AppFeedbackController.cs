using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using VIVI.Api.DTOs.Feedback;
using VIVI.Core.Entities;
using VIVI.Infrastructure.Data;

namespace VIVI.Api.Controllers;

/// <summary>In-app feedback from the mobile prompt. Anonymous, validated, and rate limited like the telemetry routes.</summary>
[ApiController]
[Route("api/app-feedback")]
[AllowAnonymous]
[EnableRateLimiting("telemetry")]
public sealed class AppFeedbackController : ControllerBase
{
    private readonly ViviDbContext _db;

    public AppFeedbackController(ViviDbContext db) => _db = db;

    [HttpPost]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Submit([FromBody] SubmitFeedbackRequest request, CancellationToken cancellationToken)
    {
        _db.AppFeedbacks.Add(new AppFeedback
        {
            Id = Guid.NewGuid(),
            Rating = request.Rating,
            Message = string.IsNullOrWhiteSpace(request.Message) ? null : request.Message.Trim(),
            Screen = request.Screen?.Trim(),
            AppVersion = request.AppVersion?.Trim(),
            Platform = request.Platform?.Trim(),
            SecondsInApp = request.SecondsInApp,
            CreatedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }
}
