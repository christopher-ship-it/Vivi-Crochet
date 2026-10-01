using VIVI.Core.Enums;

namespace VIVI.Api.DTOs.Orders;

public sealed class AdminPaymentListItemResponse
{
    public Guid Id { get; set; }
    public Guid OrderId { get; set; }
    public string OrderNumber { get; set; } = string.Empty;
    /// <summary>"Product", "Course" or "Live" (first match wins on mixed orders).</summary>
    public string Source { get; set; } = "Product";
    public string TitleSummary { get; set; } = string.Empty;
    public string CustomerName { get; set; } = string.Empty;
    public string CustomerEmail { get; set; } = string.Empty;
    public string CustomerPhone { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "INR";
    public PaymentStatus Status { get; set; }
    public PaymentProvider Provider { get; set; }
    public string ProviderOrderId { get; set; } = string.Empty;
    public string? ProviderPaymentId { get; set; }
    public bool SignatureVerified { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
}

public sealed class AdminPaymentSourceTotals
{
    public string Source { get; set; } = string.Empty;
    public string Currency { get; set; } = "INR";
    /// <summary>Sum of captured payments.</summary>
    public decimal Collected { get; set; }
    public int CapturedCount { get; set; }
    public int PendingCount { get; set; }
    public int FailedCount { get; set; }
    public decimal Refunded { get; set; }
}

public sealed class AdminPaymentsResponse
{
    public IReadOnlyList<AdminPaymentListItemResponse> Payments { get; set; } = Array.Empty<AdminPaymentListItemResponse>();
    public IReadOnlyList<AdminPaymentSourceTotals> Totals { get; set; } = Array.Empty<AdminPaymentSourceTotals>();
}
