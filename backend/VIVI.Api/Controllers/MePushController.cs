using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using VIVI.Api.DTOs.Push;
using VIVI.Api.Extensions;
using VIVI.Core.Enums;
using VIVI.Infrastructure.Commerce;
using VIVI.Infrastructure.Push;

namespace VIVI.Api.Controllers;

[ApiController]
[Route("api/me")]
[Authorize(Roles = nameof(UserRole.Customer))]
public sealed class MePushController : ControllerBase
{
    private readonly CustomerResolver _customers;
    private readonly CustomerPushService _push;

    public MePushController(CustomerResolver customers, CustomerPushService push)
    {
        _customers = customers;
        _push = push;
    }

    /// <summary>Registers or refreshes this device's Expo push token; may trigger onboarding pushes.</summary>
    [HttpPost("push-token")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> RegisterPushToken(
        [FromBody] RegisterPushTokenRequest request,
        CancellationToken cancellationToken)
    {
        var customer = await _customers.ResolveForUserAsync(User.GetUserId(), cancellationToken);
        await _push.UpsertTokenAsync(
            customer.Id,
            request.ExpoPushToken,
            request.Platform,
            cancellationToken);
        return NoContent();
    }

    /// <summary>Deactivates the device push token (call on logout).</summary>
    [HttpDelete("push-token")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> RemovePushToken(
        [FromQuery] string? expoPushToken,
        CancellationToken cancellationToken)
    {
        var customer = await _customers.ResolveForUserAsync(User.GetUserId(), cancellationToken);
        await _push.RemoveTokenAsync(customer.Id, expoPushToken, cancellationToken);
        return NoContent();
    }
}
