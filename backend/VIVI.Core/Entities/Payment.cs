using VIVI.Core.Enums;

namespace VIVI.Core.Entities;

public sealed class Payment
{
    public Guid Id { get; set; }
    public Guid OrderId { get; set; }
    public PaymentProvider Provider { get; set; } = PaymentProvider.Razorpay;
    public string ProviderOrderId { get; set; } = string.Empty;
    public string? ProviderPaymentId { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "INR";
    public PaymentStatus Status { get; set; } = PaymentStatus.Created;
    public bool SignatureVerified { get; set; }
    public DateTime? CompletedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public Order? Order { get; set; }
}
