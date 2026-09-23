namespace VIVI.Api.DTOs.AdminUsers;

public sealed class AdminTeamUserResponse
{
    public Guid Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public sealed class UpdateAdminProfileRequest
{
    public string Name { get; set; } = string.Empty;
}

public sealed class CreateAdminTeamUserRequest
{
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    /// <summary>Admin or Staff.</summary>
    public string Role { get; set; } = "Staff";
}

public sealed class UpdateAdminTeamUserRequest
{
    public string Name { get; set; } = string.Empty;
    /// <summary>Admin or Staff.</summary>
    public string Role { get; set; } = "Staff";
    public bool IsActive { get; set; } = true;
    /// <summary>Optional new password; leave empty to keep current.</summary>
    public string? NewPassword { get; set; }
}
