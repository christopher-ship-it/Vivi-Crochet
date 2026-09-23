using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using VIVI.Infrastructure.Configuration;
using VIVI.Infrastructure.Email;
using VIVI.Infrastructure.Push;
using VIVI.Infrastructure.Transcoding;

namespace VIVI.Api.Controllers;

[ApiController]
[Route("api/internal/jobs")]
[AllowAnonymous]
public sealed class InternalJobsController : ControllerBase
{
    private readonly CustomerPushService _push;
    private readonly VideoTranscodeService _transcode;
    private readonly ExpiryReminderService _expiryReminders;
    private readonly PushOptions _options;

    public InternalJobsController(
        CustomerPushService push,
        VideoTranscodeService transcode,
        ExpiryReminderService expiryReminders,
        IOptions<PushOptions> options)
    {
        _push = push;
        _transcode = transcode;
        _expiryReminders = expiryReminders;
        _options = options.Value;
    }

    /// <summary>
    /// Azure cron / manual trigger for weekly product + course + live digests.
    /// Header: X-Vivi-Job-Secret matching Push:JobSecret.
    /// Query force=true bypasses the Monday IST window (still respects 7-day customer gate).
    /// </summary>
    [HttpPost("weekly-push")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> RunWeeklyPush(
        [FromQuery] bool force = false,
        CancellationToken cancellationToken = default)
    {
        if (!SecretMatches())
            return Unauthorized();

        var notified = await _push.SendWeeklyDigestsAsync(cancellationToken, ignoreScheduleWindow: force);
        return Ok(new { notified });
    }

    /// <summary>
    /// Sends course access expiry reminders (email + push when available)
    /// for enrollments expiring in exactly 3 days. Job secret required.
    /// </summary>
    [HttpPost("expiry-reminders")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> RunExpiryReminders(CancellationToken cancellationToken = default)
    {
        if (!SecretMatches())
            return Unauthorized();

        var sent = await _expiryReminders.ProcessDueRemindersAsync(DateTime.UtcNow, cancellationToken);
        return Ok(new { sent });
    }

    /// <summary>
    /// Queue videos that still need H.264 compress (legacy Ready-on-original, Failed, or None).
    /// Header: X-Vivi-Job-Secret matching Push:JobSecret.
    /// </summary>
    [HttpPost("transcode-pending")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> QueueTranscodePending(CancellationToken cancellationToken = default)
    {
        if (!SecretMatches())
            return Unauthorized();

        var queued = await _transcode.QueueNeedingTranscodeAsync(cancellationToken);
        return Ok(new { queued });
    }

    /// <summary>Process one queued transcode immediately (same worker logic). Job secret required.</summary>
    [HttpPost("transcode-one")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> ProcessOneTranscode(CancellationToken cancellationToken = default)
    {
        if (!SecretMatches())
            return Unauthorized();

        var didWork = await _transcode.ProcessNextAsync(cancellationToken);
        return Ok(new { processed = didWork });
    }

    private bool SecretMatches()
    {
        var expected = _options.JobSecret?.Trim() ?? "";
        if (expected.Length < 16)
            return false;

        if (!Request.Headers.TryGetValue("X-Vivi-Job-Secret", out var provided))
            return false;

        var a = Encoding.UTF8.GetBytes(expected);
        var b = Encoding.UTF8.GetBytes(provided.ToString().Trim());
        return a.Length == b.Length && CryptographicOperations.FixedTimeEquals(a, b);
    }
}
