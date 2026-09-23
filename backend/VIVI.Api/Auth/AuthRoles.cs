namespace VIVI.Api.Auth;

/// <summary>Role strings for [Authorize(Roles = …)] attributes.</summary>
public static class AuthRoles
{
    /// <summary>Admin or Staff — day-to-day console access.</summary>
    public const string Console = "Admin,Staff";

    /// <summary>Full admin only — team user management.</summary>
    public const string FullAdmin = "Admin";
}
