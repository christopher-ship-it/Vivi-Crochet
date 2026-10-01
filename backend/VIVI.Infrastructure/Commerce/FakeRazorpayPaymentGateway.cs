using System.Collections.Concurrent;
using VIVI.Core.Interfaces;

namespace VIVI.Infrastructure.Commerce;

public sealed class FakeRazorpayPaymentGateway : IRazorpayPaymentGateway
{
  public const string TestKeyId = "rzp_test_fake";
  private static readonly ConcurrentDictionary<string, (int Amount, string Currency)> Orders = new();

  public Task<RazorpayOrderResult> CreateOrderAsync(
      string receipt,
      int amountPaise,
      string currency,
      CancellationToken cancellationToken)
  {
    var orderId = $"order_fake_{Guid.NewGuid():N}";
    Orders[orderId] = (amountPaise, currency);
    return Task.FromResult(new RazorpayOrderResult(orderId, amountPaise, currency));
  }

  public Task<RazorpayPaymentDetails?> FetchPaymentAsync(
      string razorpayPaymentId,
      CancellationToken cancellationToken)
  {
    if (!razorpayPaymentId.StartsWith("pay_fake_", StringComparison.Ordinal))
      return Task.FromResult<RazorpayPaymentDetails?>(null);

    var orderId = razorpayPaymentId["pay_fake_".Length..];
    if (!Orders.TryGetValue(orderId, out var order))
      return Task.FromResult<RazorpayPaymentDetails?>(null);

    return Task.FromResult<RazorpayPaymentDetails?>(
        new RazorpayPaymentDetails(orderId, razorpayPaymentId, order.Amount, order.Currency, "captured"));
  }

  public static string BuildTestPaymentId(string razorpayOrderId) => $"pay_fake_{razorpayOrderId}";

  public static string BuildTestSignature(string razorpayOrderId, string razorpayPaymentId)
      => $"sig_fake_{razorpayOrderId}_{razorpayPaymentId}";
}
