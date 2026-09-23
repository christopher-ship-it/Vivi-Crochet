using VIVI.Core.Entities;

namespace VIVI.Infrastructure.Email.Templates;

/// <summary>
/// Display-only pricing for order emails. Reconstructs original/MRP line values from
/// persisted <see cref="OrderItem.DiscountAmount"/> + paid amounts — never from live catalog.
/// </summary>
public sealed record OrderItemPricingView(
    string ProductName,
    int Quantity,
    decimal OriginalUnitPrice,
    decimal PaidUnitPrice,
    decimal OriginalLineTotal,
    decimal PaidLineTotal,
    decimal DiscountLineTotal,
    bool HasOffer);

public sealed record OrderPricingSummary(
    IReadOnlyList<OrderItemPricingView> Items,
    decimal SubtotalBeforeDiscount,
    decimal TotalSavings,
    decimal TotalPaid);

public static class OrderEmailPricing
{
    public static OrderPricingSummary FromOrder(Order order, IReadOnlyList<OrderItem> items)
    {
        var lines = items.Select(FromItem).ToList();
        var subtotalBefore = lines.Sum(l => l.OriginalLineTotal);
        var savings = lines.Sum(l => l.DiscountLineTotal);
        return new OrderPricingSummary(
            lines,
            subtotalBefore,
            savings,
            order.TotalAmount);
    }

    public static OrderItemPricingView FromItem(OrderItem item)
    {
        var qty = item.Quantity < 1 ? 1 : item.Quantity;
        var paidLine = item.TotalAmount > 0
            ? item.TotalAmount
            : item.UnitPrice * qty;

        // DiscountAmount is the authoritative MRP/list savings captured at checkout.
        var discount = item.DiscountAmount > 0 ? item.DiscountAmount : 0m;
        var originalLine = paidLine + discount;

        // No real offer if original is not strictly above paid.
        if (discount <= 0 || originalLine <= paidLine)
        {
            discount = 0m;
            originalLine = paidLine;
        }

        var paidUnit = paidLine / qty;
        var originalUnit = originalLine / qty;
        var hasOffer = discount > 0 && originalUnit > paidUnit;

        return new OrderItemPricingView(
            ProductName: item.ItemNameSnapshot,
            Quantity: qty,
            OriginalUnitPrice: originalUnit,
            PaidUnitPrice: paidUnit,
            OriginalLineTotal: originalLine,
            PaidLineTotal: paidLine,
            DiscountLineTotal: hasOffer ? discount : 0m,
            HasOffer: hasOffer);
    }
}
