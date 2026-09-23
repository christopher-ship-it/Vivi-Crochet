namespace VIVI.Api.DTOs.Auth;

public sealed class LoginResponse
{
    public string AccessToken { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public AdminUserDto User { get; set; } = new();
    /// <summary>True when India phone OTP created/signed in an account missing name, age, or place.</summary>
    public bool RequiresProfileSetup { get; set; }
    /// <summary>True when the customer record was created in the last few minutes (first signup).</summary>
    public bool IsNewCustomer { get; set; }
}

public sealed class AdminUserDto
{
    public Guid Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public string? Phone { get; set; }
}
