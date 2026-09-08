namespace VIVI.Api.DTOs.Auth;

/// <summary>
/// Development-only customer sign-in. Replaced by phone OTP in a later phase.
/// </summary>
public sealed class DevCustomerLoginRequest
{
  public string Phone { get; set; } = string.Empty;
  public string? Name { get; set; }
}
