using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using VIVI.Api.Auth;
using VIVI.Api.DTOs.Live;
using VIVI.Api.DTOs.Push;
using VIVI.Api.Services;
using VIVI.Core;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Push;

namespace VIVI.Api.Controllers;

[ApiController]
[Route("api/admin/push")]
[Authorize(Roles = AuthRoles.Console)]
public sealed class AdminPushController : ControllerBase
{
    private readonly CustomerPushService _push;
    private readonly IBlobStorageService _blob;

    public AdminPushController(CustomerPushService push, IBlobStorageService blob)
    {
        _push = push;
        _blob = blob;
    }

    /// <summary>Starts an upload for the picture of a notification (same flow as the tutor photo).</summary>
    [HttpPost("image-upload-url")]
    [ProducesResponseType(typeof(LiveTutorPhotoUploadUrlResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<LiveTutorPhotoUploadUrlResponse>> CreateImageUploadUrl(
        [FromBody] LiveTutorPhotoUploadUrlRequest request,
        CancellationToken cancellationToken)
    {
        ImageFileRules.Validate(request.FileName, request.ContentType, request.FileSizeBytes, ImageFileRules.DefaultMaxBytes);

        var safeName = ImageFileRules.SanitizeFileName(request.FileName);
        var blobPath = ImageFileRules.BuildPushImageBlobPath($"{Guid.NewGuid():N}-{safeName}");
        var ticket = await _blob.CreateUploadSasAsync(blobPath, request.ContentType.Trim(), cancellationToken);

        return Ok(new LiveTutorPhotoUploadUrlResponse
        {
            UploadUrl = ticket.UploadUrl,
            ExpiresAt = ticket.ExpiresAt,
            BlobPath = blobPath,
            MaxFileSizeBytes = ImageFileRules.DefaultMaxBytes
        });
    }

    /// <summary>Confirms the picture is stored and returns the link a notification can use.</summary>
    [HttpPost("image-upload-complete")]
    [ProducesResponseType(typeof(AdminPushImageResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminPushImageResponse>> CompleteImageUpload(
        [FromBody] LiveTutorPhotoUploadCompleteRequest request,
        CancellationToken cancellationToken)
    {
        if (!ImageFileRules.IsOwnedPushImagePath(request.BlobPath))
            throw new ViviException("INVALID_BLOB_PATH", "The blob path does not belong to a notification picture.");

        ImageFileRules.Validate(Path.GetFileName(request.BlobPath), request.ContentType, request.FileSizeBytes, ImageFileRules.DefaultMaxBytes);

        var completed = await _blob.TryCompleteUploadAsync(
            request.BlobPath,
            request.FileSizeBytes,
            request.ContentType.Trim(),
            cancellationToken);
        if (!completed)
            throw ViviException.Conflict("BLOB_MISSING", "The image file was not found in storage. Upload it, then retry.");

        // Notifications can reach phones hours later; a 15-minute link would be dead by then.
        var ticket = await _blob.CreateReadSasAsync(request.BlobPath, cancellationToken, TimeSpan.FromDays(7));
        return Ok(new AdminPushImageResponse { ImageUrl = ticket.ReadUrl });
    }

    [HttpGet("reach")]
    [ProducesResponseType(typeof(AdminPushReachResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminPushReachResponse>> GetReach(CancellationToken cancellationToken)
    {
        try
        {
            var (devices, customers) = await _push.GetReachAsync(cancellationToken);
            return Ok(new AdminPushReachResponse
            {
                ActiveDevices = devices,
                ActiveCustomers = customers
            });
        }
        catch (ViviException)
        {
            throw;
        }
        catch (Exception ex)
        {
            throw new ViviException(
                "PUSH_REACH_FAILED",
                $"Could not load push reach: {ex.GetBaseException().Message}",
                statusCode: StatusCodes.Status500InternalServerError);
        }
    }

    /// <summary>Sends a custom outside-app notification to all customers with an active push token.</summary>
    [HttpPost("broadcast")]
    [ProducesResponseType(typeof(AdminBroadcastPushResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminBroadcastPushResponse>> Broadcast(
        [FromBody] AdminBroadcastPushRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            var sent = await _push.BroadcastAsync(
                request.Title,
                request.Body,
                request.Screen,
                cancellationToken,
                request.ImageUrl);
            return Ok(new AdminBroadcastPushResponse { SentToDevices = sent });
        }
        catch (ArgumentException ex)
        {
            throw new ViviException("INVALID_PUSH", ex.Message);
        }
    }

    /// <summary>Runs the weekly product/course/live digest immediately (ignores Monday window).</summary>
    [HttpPost("weekly")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> SendWeeklyNow(CancellationToken cancellationToken)
    {
        var notified = await _push.SendWeeklyDigestsAsync(cancellationToken, ignoreScheduleWindow: true);
        return Ok(new { notified });
    }
}
