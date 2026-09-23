using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using VIVI.Api.Auth;
using VIVI.Api.DTOs.Videos;
using VIVI.Api.Extensions;
using VIVI.Api.Mapping;
using VIVI.Core;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Commerce;
using VIVI.Infrastructure.Configuration;
using VIVI.Infrastructure.Data;
using VIVI.Infrastructure.Transcoding;

namespace VIVI.Api.Controllers;

[ApiController]
[Route("api/videos")]
public sealed class VideosController : ControllerBase
{
    private readonly ViviDbContext _db;
    private readonly IBlobStorageService _blob;
    private readonly BlobStorageOptions _blobOptions;
    private readonly CustomerResolver _customers;
    private readonly ICourseAccessService _courseAccess;
    private readonly VideoTranscodeService _transcode;
    private readonly IHostEnvironment _env;
    private readonly ILogger<VideosController> _logger;

    public VideosController(
        ViviDbContext db,
        IBlobStorageService blob,
        IOptions<BlobStorageOptions> blobOptions,
        CustomerResolver customers,
        ICourseAccessService courseAccess,
        VideoTranscodeService transcode,
        IHostEnvironment env,
        ILogger<VideosController> logger)
    {
        _db = db;
        _blob = blob;
        _blobOptions = blobOptions.Value;
        _customers = customers;
        _courseAccess = courseAccess;
        _transcode = transcode;
        _env = env;
        _logger = logger;
    }

    /// <summary>Lists videos. Non-admins only see published videos. Filter with courseId.</summary>
    [HttpGet]
    [AllowAnonymous]
    [ProducesResponseType(typeof(IReadOnlyList<VideoResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<VideoResponse>>> List([FromQuery] Guid? courseId, CancellationToken cancellationToken)
    {
        var admin = User.IsAdmin();
        var query = _db.Videos.AsNoTracking().Include(v => v.Course).AsQueryable();

        if (courseId.HasValue)
            query = query.Where(v => v.CourseId == courseId);

        if (!admin)
            query = query.Where(v => v.Status == VideoStatus.Published && v.Course != null && v.Course.Status == CourseStatus.Published);

        var items = await query
            .OrderBy(v => v.CourseId)
            .ThenBy(v => v.SortOrder)
            .ToListAsync(cancellationToken);

        return Ok(items.Select(v => v.ToDto()).ToList());
    }

    /// <summary>Video metadata. Draft videos are hidden from non-admins.</summary>
    [HttpGet("{id:guid}")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(VideoResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<VideoResponse>> Get(Guid id, CancellationToken cancellationToken)
    {
        var video = await Load(id, cancellationToken, tracking: false);
        EnsureCustomerCanSee(video);
        return Ok(video.ToDto());
    }

    /// <summary>
    /// Creates a Draft video and a short-lived write SAS URL.
    /// The browser uploads the file directly to Azure Blob Storage — not through this API.
    /// Admin only.
    /// </summary>
    [HttpPost("upload-url")]
    [Authorize(Roles = AuthRoles.Console)]
    [ProducesResponseType(typeof(UploadUrlResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<UploadUrlResponse>> CreateUploadUrl(
        [FromBody] UploadUrlRequest request,
        CancellationToken cancellationToken)
    {
        VideoFileRules.Validate(request.FileName, request.ContentType, request.FileSizeBytes, _blobOptions.MaxUploadBytes);

        var courseExists = await _db.Courses.AnyAsync(c => c.Id == request.CourseId, cancellationToken);
        if (!courseExists)
            throw ViviException.NotFound("COURSE_NOT_FOUND", "Course was not found.");

        var safeName = VideoFileRules.SanitizeFileName(request.FileName);
        var uniqueName = $"{Guid.NewGuid():N}-{safeName}";
        var videoId = Guid.NewGuid();
        var blobPath = VideoFileRules.BuildOriginalBlobPath(request.CourseId, videoId, uniqueName);

        var nextOrder = await _db.Videos
            .Where(v => v.CourseId == request.CourseId)
            .Select(v => (int?)v.SortOrder)
            .MaxAsync(cancellationToken) ?? -1;

        var now = DateTime.UtcNow;
        var video = new Video
        {
            Id = videoId,
            CourseId = request.CourseId,
            Title = Path.GetFileNameWithoutExtension(safeName),
            BlobPath = blobPath,
            OriginalBlobPath = blobPath,
            VideoFileName = safeName,
            FileSizeBytes = request.FileSizeBytes,
            ContentType = request.ContentType.Trim(),
            TranscodeStatus = VideoTranscodeStatus.None,
            Status = VideoStatus.Draft,
            UploadConfirmed = false,
            SortOrder = nextOrder + 1,
            CreatedAt = now,
            UpdatedAt = now,
            CreatedBy = User.GetUserId()
        };

        _db.Videos.Add(video);
        await _db.SaveChangesAsync(cancellationToken);

        var ticket = await _blob.CreateUploadSasAsync(blobPath, video.ContentType, cancellationToken);

        return Ok(new UploadUrlResponse
        {
            VideoId = video.Id,
            UploadUrl = ticket.UploadUrl,
            ExpiresAt = ticket.ExpiresAt,
            BlobPath = blobPath,
            MaxFileSizeBytes = _blobOptions.MaxUploadBytes
        });
    }

    /// <summary>Confirms the browser finished uploading to Blob Storage. Video stays Draft. Admin only.</summary>
    [HttpPost("{id:guid}/upload-complete")]
    [Authorize(Roles = AuthRoles.Console)]
    [ProducesResponseType(typeof(VideoResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<VideoResponse>> CompleteUpload(Guid id, CancellationToken cancellationToken)
    {
        var video = await Load(id, cancellationToken, tracking: true);

        var completed = await _blob.TryCompleteUploadAsync(
            video.BlobPath,
            video.FileSizeBytes,
            video.ContentType,
            cancellationToken);

        if (!completed)
            throw ViviException.Conflict("BLOB_MISSING", "The video file was not found in storage. Upload it to the SAS URL, then retry.");

        var props = await _blob.GetPropertiesAsync(video.BlobPath, cancellationToken);
        if (props.SizeBytes is > 0)
            video.FileSizeBytes = props.SizeBytes.Value;
        if (!string.IsNullOrWhiteSpace(props.ContentType))
            video.ContentType = props.ContentType;

        video.UploadConfirmed = true;
        video.Status = VideoStatus.Draft;
        if (string.IsNullOrWhiteSpace(video.OriginalBlobPath))
            video.OriginalBlobPath = video.BlobPath;

        if (_env.IsEnvironment("Testing"))
        {
            // Unit tests have no ffmpeg / media bytes — treat upload as playable immediately.
            video.TranscodeStatus = VideoTranscodeStatus.Ready;
            video.TranscodeError = null;
            video.PlayableContentType = video.ContentType;
            video.PlayableFileSizeBytes = video.FileSizeBytes;
        }
        else
        {
            _transcode.QueueVideo(video);
        }

        video.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        return Ok(video.ToDto());
    }

    /// <summary>Updates lesson metadata. Does not replace the blob. Admin only.</summary>
    [HttpPut("{id:guid}")]
    [Authorize(Roles = AuthRoles.Console)]
    [ProducesResponseType(typeof(VideoResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<VideoResponse>> Update(Guid id, [FromBody] UpdateVideoRequest request, CancellationToken cancellationToken)
    {
        var video = await Load(id, cancellationToken, tracking: true);
        video.Title = request.Title.Trim();
        video.Description = request.Description?.Trim();
        video.DurationSeconds = request.DurationSeconds;
        video.IsFreePreview = request.IsFreePreview;
        if (request.SortOrder.HasValue)
            video.SortOrder = request.SortOrder.Value;
        video.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        return Ok(video.ToDto());
    }

    /// <summary>
    /// Fills DurationSeconds from real playback metadata when it is still missing.
    /// Safe for enrolled viewers / free-preview playback — never overwrites an existing value.
    /// </summary>
    [HttpPost("{id:guid}/report-duration")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(VideoResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<VideoResponse>> ReportDuration(
        Guid id,
        [FromBody] ReportVideoDurationRequest request,
        CancellationToken cancellationToken)
    {
        if (request.DurationSeconds < 1)
            throw new ViviException("INVALID_DURATION", "Duration must be at least 1 second.");

        var video = await Load(id, cancellationToken, tracking: true);

        if (video.Status != VideoStatus.Published)
        {
            if (!(User.IsAdmin() && video.UploadConfirmed))
                throw ViviException.Forbidden("VIDEO_NOT_PUBLISHED", "This video is not published.");
        }
        else if (!User.IsAdmin() && !video.IsFreePreview)
        {
            if (User.Identity?.IsAuthenticated != true)
                throw ViviException.Unauthorized("UNAUTHORIZED", "Sign in to watch this lesson.");

            var customer = await _customers.ResolveForUserAsync(User.GetUserId(), cancellationToken);
            var now = DateTime.UtcNow;
            var hasAccess = await _courseAccess.HasActiveEnrollmentAsync(
                customer.Id,
                video.CourseId,
                now,
                cancellationToken);
            if (!hasAccess)
                throw ViviException.Forbidden("ENROLLMENT_REQUIRED", "Purchase this course to watch this lesson.");
        }

        if (video.DurationSeconds is null or <= 0)
        {
            video.DurationSeconds = request.DurationSeconds;
            video.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(cancellationToken);
        }

        return Ok(video.ToDto());
    }

    /// <summary>Deletes the video record and the blob. Remaining lessons keep their sort order. Admin only.</summary>
    [HttpDelete("{id:guid}")]
    [Authorize(Roles = AuthRoles.Console)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        var video = await _db.Videos.SingleOrDefaultAsync(v => v.Id == id, cancellationToken)
            ?? throw ViviException.NotFound("VIDEO_NOT_FOUND", "Video was not found.");

        var blobPaths = new[]
            {
                video.BlobPath,
                video.OriginalBlobPath,
                VideoFileRules.BuildPlayableBlobPath(video.CourseId, video.Id),
                video.ThumbnailBlobPath,
                video.PatternPdfBlobPath
            }
            .Where(path => !string.IsNullOrWhiteSpace(path))
            .Select(path => path!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        _db.Videos.Remove(video);
        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex)
        {
            _logger.LogError(ex, "Failed to delete video {VideoId}", id);
            throw ViviException.Conflict(
                "VIDEO_DELETE_FAILED",
                "This lesson could not be deleted. Reload the page and try again.");
        }

        foreach (var blobPath in blobPaths)
        {
            try
            {
                await _blob.DeleteAsync(blobPath, cancellationToken);
            }
            catch (Exception ex)
            {
                // The database row is already gone — do not fail the admin action if blob cleanup fails.
                _logger.LogWarning(ex, "Failed to delete blob {BlobPath} for video {VideoId}", blobPath, id);
            }
        }

        return NoContent();
    }

    /// <summary>Publishes a video. The file must have been confirmed in storage. Admin only.</summary>
    [HttpPost("{id:guid}/publish")]
    [Authorize(Roles = AuthRoles.Console)]
    [ProducesResponseType(typeof(VideoResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<VideoResponse>> Publish(Guid id, CancellationToken cancellationToken)
    {
        var video = await Load(id, cancellationToken, tracking: true);
        if (!video.UploadConfirmed)
            throw ViviException.Conflict("UPLOAD_INCOMPLETE", "Confirm the upload before publishing this video.");

        if (video.TranscodeStatus != VideoTranscodeStatus.Ready)
            throw ViviException.Conflict(
                "TRANSCODE_NOT_READY",
                video.TranscodeStatus == VideoTranscodeStatus.Failed
                    ? "Mobile compress failed. Retry compress, then publish."
                    : "Wait until mobile compress finishes before publishing this lesson.");

        video.Status = VideoStatus.Published;
        video.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        return Ok(video.ToDto());
    }

    /// <summary>Re-queue H.264 compress for this lesson (keeps original). Admin only.</summary>
    [HttpPost("{id:guid}/requeue-transcode")]
    [Authorize(Roles = AuthRoles.Console)]
    [ProducesResponseType(typeof(VideoResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<VideoResponse>> RequeueTranscode(Guid id, CancellationToken cancellationToken)
    {
        var video = await Load(id, cancellationToken, tracking: true);
        if (!video.UploadConfirmed)
            throw ViviException.Conflict("UPLOAD_INCOMPLETE", "Confirm the upload before compressing.");

        if (string.IsNullOrWhiteSpace(video.OriginalBlobPath))
            video.OriginalBlobPath = video.BlobPath;

        _transcode.QueueVideo(video);
        await _db.SaveChangesAsync(cancellationToken);
        return Ok(video.ToDto());
    }

    /// <summary>Returns the video to Draft. Admin only.</summary>
    [HttpPost("{id:guid}/unpublish")]
    [Authorize(Roles = AuthRoles.Console)]
    [ProducesResponseType(typeof(VideoResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<VideoResponse>> Unpublish(Guid id, CancellationToken cancellationToken)
    {
        var video = await Load(id, cancellationToken, tracking: true);
        video.Status = VideoStatus.Draft;
        video.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        return Ok(video.ToDto());
    }

    /// <summary>
    /// Returns a short-lived read SAS URL for playback.
    /// Free-preview lessons are anonymous; other published lessons require active course enrollment.
    /// Admins may also stream uploaded drafts (e.g. to detect duration).
    /// </summary>
    [HttpGet("{id:guid}/stream-url")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(StreamUrlResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<StreamUrlResponse>> StreamUrl(Guid id, CancellationToken cancellationToken)
    {
        var video = await Load(id, cancellationToken, tracking: false);

        if (video.Status != VideoStatus.Published)
        {
            // Admins may probe duration on uploaded drafts; learners only see published.
            if (!(User.IsAdmin() && video.UploadConfirmed))
                throw ViviException.Forbidden("VIDEO_NOT_PUBLISHED", "This video is not published.");
        }
        else if (!video.UploadConfirmed)
        {
            throw ViviException.Conflict("UPLOAD_INCOMPLETE", "This video has no confirmed file in storage.");
        }

        if (!User.IsAdmin() && video.Course?.Status != CourseStatus.Published)
            throw ViviException.NotFound("VIDEO_NOT_FOUND", "Video was not found.");

        if (!User.IsAdmin() && !video.IsFreePreview)
        {
            if (User.Identity?.IsAuthenticated != true)
                throw ViviException.Unauthorized("UNAUTHORIZED", "Sign in to watch this lesson.");

            var customer = await _customers.ResolveForUserAsync(User.GetUserId(), cancellationToken);
            var now = DateTime.UtcNow;
            var hasAccess = await _courseAccess.HasActiveEnrollmentAsync(
                customer.Id,
                video.CourseId,
                now,
                cancellationToken);

            if (!hasAccess)
            {
                var expired = await _db.CourseEnrollments.AsNoTracking()
                    .AnyAsync(
                        e => e.CustomerId == customer.Id
                             && e.CourseId == video.CourseId
                             && e.AccessExpiryDate <= now,
                        cancellationToken);

                if (expired)
                    throw ViviException.Forbidden("ACCESS_EXPIRED", "Your access to this course has expired.");

                throw ViviException.Forbidden("ENROLLMENT_REQUIRED", "Purchase this course to watch this lesson.");
            }
        }

        var blobProps = await _blob.GetPropertiesAsync(video.BlobPath, cancellationToken);
        if (!blobProps.Exists)
            throw ViviException.Conflict("BLOB_MISSING", "Video file not found. Re-upload the lesson from the admin dashboard.");

        var ticket = await _blob.CreateReadSasAsync(video.BlobPath, cancellationToken);
        return Ok(new StreamUrlResponse
        {
            VideoId = video.Id,
            Title = video.Title,
            StreamUrl = ticket.ReadUrl,
            ExpiresAt = ticket.ExpiresAt
        });
    }

    private async Task<Video> Load(Guid id, CancellationToken cancellationToken, bool tracking)
    {
        var query = tracking ? _db.Videos.AsQueryable() : _db.Videos.AsNoTracking();
        var video = await query
            .Include(v => v.Course)
            .SingleOrDefaultAsync(v => v.Id == id, cancellationToken);

        return video ?? throw ViviException.NotFound("VIDEO_NOT_FOUND", "Video was not found.");
    }

    private void EnsureCustomerCanSee(Video video)
    {
        if (User.IsAdmin())
            return;

        if (video.Status != VideoStatus.Published || video.Course?.Status != CourseStatus.Published)
            throw ViviException.NotFound("VIDEO_NOT_FOUND", "Video was not found.");
    }
}
