namespace VIVI.Api.DTOs.Auth;

/// <summary>
/// Passwordless sign-in for the complimentary test account. The phone is never taken
/// from the caller — only the account configured in Seed:TestAccount can be signed into.
/// </summary>
public sealed class TestAccountLoginRequest
{
  public string Secret { get; set; } = string.Empty;
}
