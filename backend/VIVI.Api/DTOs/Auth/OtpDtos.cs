namespace VIVI.Api.DTOs.Auth;

public sealed class OtpRequest
{
    public string Phone { get; set; } = string.Empty;
}

public sealed class OtpRequestResponse
{
    public Guid ChallengeId { get; set; }
    public int ExpiresInSeconds { get; set; }
}

public sealed class OtpVerifyRequest
{
    public Guid ChallengeId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string? Name { get; set; }
}
