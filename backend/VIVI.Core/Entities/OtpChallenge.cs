namespace VIVI.Core.Entities;

public sealed class OtpChallenge
{
    public Guid Id { get; set; }
    public string Phone { get; set; } = string.Empty;
    public string ProviderSessionId { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public int AttemptCount { get; set; }
    public DateTime? VerifiedAt { get; set; }
    public DateTime CreatedAt { get; set; }
}
