namespace VIVI.Core.Entities;

/// <summary>Email OTP challenge to prove ownership of a communication email.</summary>
public sealed class EmailVerificationChallenge
{
    public Guid Id { get; set; }
    public Guid CustomerId { get; set; }
    public string Email { get; set; } = string.Empty;
    public string CodeHash { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public int AttemptCount { get; set; }
    public DateTime? VerifiedAt { get; set; }
    public DateTime CreatedAt { get; set; }

    public Customer? Customer { get; set; }
}
