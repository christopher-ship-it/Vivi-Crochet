using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;

namespace VIVI.Api.Extensions;

public static class UserExtensions
{
    public static bool IsAdmin(this ClaimsPrincipal user)
        => user.Identity?.IsAuthenticated == true
           && user.IsInRole(nameof(UserRole.Admin));

    public static Guid GetUserId(this ClaimsPrincipal user)
    {
        var value = user.FindFirstValue(ClaimTypes.NameIdentifier)
                    ?? user.FindFirstValue(JwtRegisteredClaimNames.Sub);

        if (!Guid.TryParse(value, out var id))
            throw ViviException.Unauthorized("UNAUTHORIZED", "The access token is missing a user id.");

        return id;
    }
}
