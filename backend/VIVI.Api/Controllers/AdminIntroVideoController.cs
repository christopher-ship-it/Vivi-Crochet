using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using VIVI.Api.Auth;
using VIVI.Api.DTOs.Admin;
using VIVI.Core;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Configuration;
using VIVI.Infrastructure.Data;

namespace VIVI.Api.Controllers;

/// <summary>Upload and manage the welcome video of the app from the admin dashboard.</summary>
[ApiController]
[Route("api/admin/intro-video")]
[Authorize(Roles = AuthRoles.Console)]
public sealed class AdminIntroVideoController : ControllerBase
{
    private readonly ViviDbContext _db;
    private readonly IBlobStorageService _blob;
    private readonly BlobStorageOptions _blobOptions;

    public AdminIntroVideoController(
        ViviDbContext db,
        IBlobStorageService blob,
        IOptions<BlobStorageOptions> blobOptions)
    {
        _db = db;
        _blob = blob;
        _blobOptions = blobOptions.Value;
    }

    [HttpGet]
    [ProducesResponseType(typeof(AdminIntroVideoResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminIntroVideoResponse>> Get(CancellationToken cancellationToken)
        => Ok(await ToDtoAsync(await _db.IntroVideos.AsNoTracking().FirstOrDefaultAsync(cancellationToken), cancellationToken));

    /// <summary>Starts an upload: the browser sends the file straight to storage using the returned link.</summary>
    [HttpPost("upload-url")]
    [ProducesResponseType(typeof(IntroVideoUploadUrlResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<IntroVideoUploadUrlResponse>> CreateUploadUrl(
        [FromBody] IntroVideoUploadUrlRequest request,
        CancellationToken cancellationToken)
    {
        VideoFileRules.Validate(request.FileName, request.ContentType, request.FileSizeBytes, _blobOptions.MaxUploadBytes);
        var blobPath = VideoFileRules.BuildIntroOriginalBlobPath(
            Guid.NewGuid(), VideoFileRules.SanitizeFileName(request.FileName));
        var ticket = await _blob.CreateUploadSasAsync(blobPath, request.ContentType.Trim(), cancellationToken);
        return Ok(new IntroVideoUploadUrlResponse
        {
            UploadUrl = ticket.UploadUrl,
            ExpiresAt = ticket.ExpiresAt,
            BlobPath = blobPath,
            MaxFileSizeBytes = _blobOptions.MaxUploadBytes
        });
    }

    /// <summary>Confirms the upload reached storage and queues it for compression.</summary>
    [HttpPost("upload-complete")]
    [ProducesResponseType(typeof(AdminIntroVideoResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminIntroVideoResponse>> CompleteUpload(
        [FromBody] IntroVideoUploadCompleteRequest request,
        CancellationToken cancellationToken)
    {
        if (!request.BlobPath.StartsWith("intro/", StringComparison.Ordinal) || request.BlobPath.Contains(".."))
            throw new ViviException("INVALID_BLOB_PATH", "That is not an intro video upload.");

        var completed = await _blob.TryCompleteUploadAsync(
            request.BlobPath, request.FileSizeBytes, request.ContentType.Trim(), cancellationToken);
        if (!completed)
            throw ViviException.Conflict("BLOB_MISSING", "The video file was not found in storage. Upload it again.");

        var props = await _blob.GetPropertiesAsync(request.BlobPath, cancellationToken);
        var now = DateTime.UtcNow;
        var intro = await _db.IntroVideos.FirstOrDefaultAsync(cancellationToken);
        if (intro is null)
        {
            intro = new IntroVideo { Id = Guid.NewGuid(), CreatedAt = now, IsEnabled = true };
            _db.IntroVideos.Add(intro);
        }

        var previousOriginal = intro.OriginalBlobPath;
        intro.OriginalBlobPath = request.BlobPath;
        intro.FileName = VideoFileRules.SanitizeFileName(request.FileName);
        intro.FileSizeBytes = props.SizeBytes is > 0 ? props.SizeBytes.Value : request.FileSizeBytes;
        intro.ContentType = request.ContentType.Trim();
        intro.UploadConfirmed = true;
        intro.TranscodeStatus = VideoTranscodeStatus.Queued;
        intro.TranscodeError = null;
        intro.UpdatedAt = now;
        await _db.SaveChangesAsync(cancellationToken);

        // Never delete a file the app is still playing (the playable copy can be the original itself).
        if (!string.IsNullOrWhiteSpace(previousOriginal)
            && previousOriginal != request.BlobPath
            && previousOriginal != intro.BlobPath)
        {
            try
            {
                await _blob.DeleteAsync(previousOriginal, cancellationToken);
            }
            catch
            {
                // An old upload that cannot be deleted just stays in storage.
            }
        }

        return Ok(await ToDtoAsync(intro, cancellationToken));
    }

    /// <summary>Turns the intro video on or off in the app without deleting it.</summary>
    [HttpPut("settings")]
    [ProducesResponseType(typeof(AdminIntroVideoResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminIntroVideoResponse>> UpdateSettings(
        [FromBody] IntroVideoSettingsRequest request,
        CancellationToken cancellationToken)
    {
        var intro = await _db.IntroVideos.FirstOrDefaultAsync(cancellationToken)
            ?? throw ViviException.NotFound("INTRO_VIDEO_NOT_FOUND", "Upload an intro video first.");
        intro.IsEnabled = request.IsEnabled;
        intro.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        return Ok(await ToDtoAsync(intro, cancellationToken));
    }

    /// <summary>Removes the intro video and its files. The app stops showing the play icon.</summary>
    [HttpDelete]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Delete(CancellationToken cancellationToken)
    {
        var intro = await _db.IntroVideos.FirstOrDefaultAsync(cancellationToken);
        if (intro is null)
            return NoContent();

        var paths = new[] { intro.OriginalBlobPath, intro.BlobPath }
            .Where(p => !string.IsNullOrWhiteSpace(p)).Distinct().ToList();
        _db.IntroVideos.Remove(intro);
        await _db.SaveChangesAsync(cancellationToken);

        foreach (var path in paths)
        {
            try
            {
                await _blob.DeleteAsync(path, cancellationToken);
            }
            catch
            {
                // Leftover files in storage are harmless.
            }
        }

        return NoContent();
    }

    private async Task<AdminIntroVideoResponse> ToDtoAsync(IntroVideo? intro, CancellationToken cancellationToken)
    {
        if (intro is null)
            return new AdminIntroVideoResponse();

        string? preview = null;
        if (!string.IsNullOrWhiteSpace(intro.BlobPath))
        {
            var props = await _blob.GetPropertiesAsync(intro.BlobPath, cancellationToken);
            if (props.Exists)
                preview = (await _blob.CreateReadSasAsync(intro.BlobPath, cancellationToken)).ReadUrl;
        }

        return new AdminIntroVideoResponse
        {
            HasVideo = !string.IsNullOrWhiteSpace(intro.BlobPath),
            IsEnabled = intro.IsEnabled,
            FileName = string.IsNullOrWhiteSpace(intro.FileName) ? null : intro.FileName,
            UploadedFileSizeBytes = intro.FileSizeBytes > 0 ? intro.FileSizeBytes : null,
            PlayableFileSizeBytes = intro.PlayableFileSizeBytes,
            Status = intro.TranscodeStatus.ToString(),
            Error = intro.TranscodeError,
            Version = intro.Version,
            UpdatedAt = intro.UpdatedAt,
            PreviewUrl = preview
        };
    }
}
