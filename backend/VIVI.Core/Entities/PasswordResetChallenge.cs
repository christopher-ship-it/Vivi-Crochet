namespace VIVI.Core.Entities;

/// <summary>Email OTP challenge used to reset international customer passwords.</summary>
public sealed class PasswordResetChallenge
{
    public Guid Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string CodeHash { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public int AttemptCount { get; set; }
    public DateTime? VerifiedAt { get; set; }
    public DateTime CreatedAt { get; set; }
}
