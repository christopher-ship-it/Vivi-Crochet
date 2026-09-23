using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;

namespace VIVI.Api.Extensions;

public static class UserExtensions
{
    /// <summary>Admin or Staff — anyone allowed into the VIVI admin console.</summary>
    public static bool IsConsoleUser(this ClaimsPrincipal user)
        => user.Identity?.IsAuthenticated == true
           && (user.IsInRole(nameof(UserRole.Admin)) || user.IsInRole(nameof(UserRole.Staff)));

    /// <summary>Full admin only — team/user management and elevated actions.</summary>
    public static bool IsFullAdmin(this ClaimsPrincipal user)
        => user.Identity?.IsAuthenticated == true
           && user.IsInRole(nameof(UserRole.Admin));

    /// <summary>Console operator (Admin or Staff). Used for admin catalog views.</summary>
    public static bool IsAdmin(this ClaimsPrincipal user)
        => user.IsConsoleUser();

    public static Guid GetUserId(this ClaimsPrincipal user)
    {
        var value = user.FindFirstValue(ClaimTypes.NameIdentifier)
                    ?? user.FindFirstValue(JwtRegisteredClaimNames.Sub);

        if (!Guid.TryParse(value, out var id))
            throw ViviException.Unauthorized("UNAUTHORIZED", "The access token is missing a user id.");

        return id;
    }
}
