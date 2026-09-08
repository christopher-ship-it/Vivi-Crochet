namespace VIVI.Infrastructure.Configuration;

public sealed class TwoFactorOptions
{
    public const string SectionName = "TwoFactor";

    public string ApiKey { get; set; } = string.Empty;
    public string Template { get; set; } = "Login_Verification_OTP";
    public string BaseUrl { get; set; } = "https://2factor.in/API/V1";
    public bool Enabled { get; set; } = true;
    public int OtpExpiryMinutes { get; set; } = 5;
    public int MaxAttempts { get; set; } = 5;
}
