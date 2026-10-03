using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VIVI.Api.DTOs.Videos;
using VIVI.Api.Extensions;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Infrastructure.Commerce;
using VIVI.Infrastructure.Data;

namespace VIVI.Api.Controllers;

/// <summary>Saves and returns how far the signed-in customer has watched each lesson video.</summary>
[ApiController]
[Route("api/me")]
[Authorize(Roles = nameof(UserRole.Customer))]
public sealed class MeVideoProgressController : ControllerBase
{
    private const int MaxDurationSeconds = 24 * 60 * 60;

    private readonly ViviDbContext _db;
    private readonly CustomerResolver _customers;

    public MeVideoProgressController(ViviDbContext db, CustomerResolver customers)
    {
        _db = db;
        _customers = customers;
    }

    /// <summary>Records the learner's position in one video. Safe to call repeatedly while watching.</summary>
    [HttpPut("video-progress/{videoId:guid}")]
    [ProducesResponseType(typeof(VideoProgressResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<VideoProgressResponse>> Save(
        Guid videoId,
        [FromBody] SaveVideoProgressRequest request,
        CancellationToken cancellationToken)
    {
        if (request.DurationSeconds <= 0 || request.DurationSeconds > MaxDurationSeconds)
            throw new ViviException("INVALID_PROGRESS", "Video length is not valid.");
        if (request.PositionSeconds < 0)
            throw new ViviException("INVALID_PROGRESS", "Position cannot be negative.");

        var customer = await _customers.ResolveForUserAsync(User.GetUserId(), cancellationToken);
        var courseId = await _db.Videos
            .AsNoTracking()
            .Where(v => v.Id == videoId)
            .Select(v => (Guid?)v.CourseId)
            .SingleOrDefaultAsync(cancellationToken)
            ?? throw ViviException.NotFound("VIDEO_NOT_FOUND", "Video was not found.");

        var duration = request.DurationSeconds;
        var position = Math.Min(request.PositionSeconds, duration);
        var now = DateTime.UtcNow;

        // Two saves can arrive together (pause + a timer tick); the unique index allows one row,
        // so if the insert loses the race, update the row that won.
        for (var attempt = 0; ; attempt++)
        {
            var row = await _db.VideoProgress
                .SingleOrDefaultAsync(p => p.CustomerId == customer.Id && p.VideoId == videoId, cancellationToken);
            var isNew = row is null;
            row ??= new VideoProgress
            {
                Id = Guid.NewGuid(),
                CustomerId = customer.Id,
                VideoId = videoId
            };

            row.CourseId = courseId;
            row.PositionSeconds = position;
            row.DurationSeconds = duration;
            row.IsCompleted = row.IsCompleted || position >= duration * VideoProgress.CompletedFraction;
            row.UpdatedAt = now;
            if (isNew)
                _db.VideoProgress.Add(row);

            try
            {
                await _db.SaveChangesAsync(cancellationToken);
                return Ok(ToResponse(row));
            }
            catch (DbUpdateException) when (isNew && attempt == 0)
            {
                _db.Entry(row).State = EntityState.Detached;
            }
        }
    }

    /// <summary>Progress for every video of a course that the learner has started.</summary>
    [HttpGet("courses/{courseId:guid}/video-progress")]
    [ProducesResponseType(typeof(IReadOnlyList<VideoProgressResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<VideoProgressResponse>>> ForCourse(
        Guid courseId,
        CancellationToken cancellationToken)
    {
        var customer = await _customers.ResolveForUserAsync(User.GetUserId(), cancellationToken);
        var rows = await _db.VideoProgress
            .AsNoTracking()
            .Where(p => p.CustomerId == customer.Id && p.CourseId == courseId)
            .ToListAsync(cancellationToken);
        return Ok(rows.Select(ToResponse).ToList());
    }

    private static VideoProgressResponse ToResponse(VideoProgress row) => new()
    {
        VideoId = row.VideoId,
        CourseId = row.CourseId,
        PositionSeconds = row.PositionSeconds,
        DurationSeconds = row.DurationSeconds,
        IsCompleted = row.IsCompleted,
        Percent = row.IsCompleted
            ? 100
            : row.DurationSeconds > 0
                ? Math.Clamp((int)Math.Round(100.0 * row.PositionSeconds / row.DurationSeconds), 0, 99)
                : 0,
        UpdatedAt = row.UpdatedAt
    };
}
