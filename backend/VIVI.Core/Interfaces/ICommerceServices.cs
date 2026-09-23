using VIVI.Core.Entities;
using VIVI.Core.Enums;

namespace VIVI.Core.Interfaces;

public sealed record RazorpayOrderResult(
    string RazorpayOrderId,
    int AmountPaise,
    string Currency);

public sealed record RazorpayPaymentDetails(
    string RazorpayOrderId,
    string RazorpayPaymentId,
    int AmountPaise,
    string Currency,
    string Status);

public interface IRazorpayPaymentGateway
{
    Task<RazorpayOrderResult> CreateOrderAsync(
        string receipt,
        int amountPaise,
        string currency,
        CancellationToken cancellationToken);

    Task<RazorpayPaymentDetails?> FetchPaymentAsync(
        string razorpayPaymentId,
        CancellationToken cancellationToken);
}

public interface IRazorpaySignatureVerifier
{
    bool VerifyPaymentSignature(string razorpayOrderId, string razorpayPaymentId, string razorpaySignature);
    bool VerifyWebhookSignature(string payload, string signature);
}

public interface ICourseAccessService
{
    Task<bool> HasActiveEnrollmentAsync(Guid customerId, Guid courseId, DateTime utcNow, CancellationToken cancellationToken);
}

public readonly record struct DeliveryWindow(int MinDays, int MaxDays);

public readonly record struct DeliveryDateRange(DateTime From, DateTime To);

public sealed record ShippingAddressInput(
    string FullName,
    string PhoneNumber,
    string AddressLine1,
    string? AddressLine2,
    string? Landmark,
    string City,
    string State,
    string PinCode,
    string? Country = null);

/// <summary>
/// Server-side delivery estimation. Calendar dates are IST days counted from
/// successful payment confirmation (or "now" as a provisional preview before payment).
/// </summary>
public interface IDeliveryEstimateService
{
    void EnsureOnlinePaymentOrThrow(string? paymentMethod);
    bool IsCoimbatore(ShippingAddressInput address);
    DeliveryWindow WindowFor(ProductType productType, bool isCoimbatore);
    DeliveryWindow Combine(IEnumerable<DeliveryWindow> windows);
    DeliveryDateRange ToCalendarDates(DeliveryWindow window, DateTime utcAnchor);
    DeliveryDateRange GetSystemDates(Order order);
    DeliveryDateRange GetEffectiveDates(Order order);
    bool HasManualOverride(Order order);
    string FormatWindowSummary(DeliveryWindow window);
    string FormatDateRange(DateTime from, DateTime to);
    string CustomerDeliveryLabel(Order order);
    void ApplySystemEstimate(Order order, DeliveryWindow window, bool isCoimbatore, DateTime utcAnchor);
    void ApplyConfirmedDates(Order order, DateTime paidAtUtc);
}
