using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using VIVI.Api.Auth;
using VIVI.Api.DTOs.Push;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Infrastructure.Push;

namespace VIVI.Api.Controllers;

[ApiController]
[Route("api/admin/push")]
[Authorize(Roles = AuthRoles.Console)]
public sealed class AdminPushController : ControllerBase
{
    private readonly CustomerPushService _push;

    public AdminPushController(CustomerPushService push)
    {
        _push = push;
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
                cancellationToken);
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
