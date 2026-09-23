namespace VIVI.Api.DTOs.Auth;

public sealed class CustomerEmailRegisterRequest
{
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public int Age { get; set; }
    public string Country { get; set; } = string.Empty;
    public string? Name { get; set; }
}

public sealed class CustomerEmailLoginRequest
{
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public sealed class CustomerPasswordResetRequest
{
    public string Email { get; set; } = string.Empty;
}

public sealed class CustomerPasswordResetRequestResponse
{
    public int ExpiresInSeconds { get; set; }
    public string Message { get; set; } = string.Empty;
}

public sealed class CustomerPasswordResetConfirmRequest
{
    public string Email { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string NewPassword { get; set; } = string.Empty;
}
