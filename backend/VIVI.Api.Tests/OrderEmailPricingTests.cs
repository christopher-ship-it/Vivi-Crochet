using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Infrastructure.Email.Templates;
using Xunit;

namespace VIVI.Api.Tests;

public sealed class OrderEmailPricingTests
{
    [Fact]
    public void Product_with_mrp_offer_qty_1()
    {
        var line = OrderEmailPricing.FromItem(Item(
            name: "Black Aura Luxe Bag",
            qty: 1,
            unitPrice: 2500,
            discount: 250,
            total: 2500));

        Assert.True(line.HasOffer);
        Assert.Equal(2750m, line.OriginalUnitPrice);
        Assert.Equal(2500m, line.PaidUnitPrice);
        Assert.Equal(2750m, line.OriginalLineTotal);
        Assert.Equal(2500m, line.PaidLineTotal);
        Assert.Equal(250m, line.DiscountLineTotal);
    }

    [Fact]
    public void Product_with_mrp_offer_qty_2()
    {
        var line = OrderEmailPricing.FromItem(Item(
            name: "Black Aura Luxe Bag",
            qty: 2,
            unitPrice: 2500,
            discount: 500,
            total: 5000));

        Assert.True(line.HasOffer);
        Assert.Equal(2750m, line.OriginalUnitPrice);
        Assert.Equal(2500m, line.PaidUnitPrice);
        Assert.Equal(5500m, line.OriginalLineTotal);
        Assert.Equal(5000m, line.PaidLineTotal);
        Assert.Equal(500m, line.DiscountLineTotal);
    }

    [Fact]
    public void Full_price_product_has_no_offer()
    {
        var line = OrderEmailPricing.FromItem(Item(
            name: "Pink Yarn",
            qty: 1,
            unitPrice: 899,
            discount: 0,
            total: 899));

        Assert.False(line.HasOffer);
        Assert.Equal(899m, line.OriginalLineTotal);
        Assert.Equal(899m, line.PaidLineTotal);
        Assert.Equal(0m, line.DiscountLineTotal);
    }

    [Fact]
    public void Mixed_order_summary_matches_example()
    {
        var order = new Order
        {
            Subtotal = 3599m,
            DiscountAmount = 250m,
            TotalAmount = 3599m
        };
        var items = new[]
        {
            Item("Pink Yarn", 1, 899, 0, 899),
            Item("Bag rings", 1, 200, 0, 200),
            Item("Black Aura Luxe Bag", 1, 2500, 250, 2500)
        };

        var summary = OrderEmailPricing.FromOrder(order, items);

        Assert.Equal(3849m, summary.SubtotalBeforeDiscount);
        Assert.Equal(250m, summary.TotalSavings);
        Assert.Equal(3599m, summary.TotalPaid);
        Assert.Equal(2, summary.Items.Count(i => !i.HasOffer));
        Assert.Single(summary.Items, i => i.HasOffer);
    }

    [Fact]
    public void Historical_discount_ignores_current_catalog()
    {
        // Persisted at purchase: MRP 2750 → paid 2500. Catalog may later show MRP 3000.
        var line = OrderEmailPricing.FromItem(Item(
            name: "Black Aura Luxe Bag",
            qty: 1,
            unitPrice: 2500,
            discount: 250,
            total: 2500));

        Assert.Equal(2750m, line.OriginalLineTotal);
        Assert.Equal(250m, line.DiscountLineTotal);
    }

    [Fact]
    public void Missing_discount_does_not_invent_mrp()
    {
        var line = OrderEmailPricing.FromItem(Item(
            name: "Plain Piece",
            qty: 1,
            unitPrice: 1200,
            discount: 0,
            total: 1200));

        Assert.False(line.HasOffer);
        Assert.Equal(1200m, line.OriginalLineTotal);
        Assert.Equal(0m, line.DiscountLineTotal);
    }

    [Fact]
    public void Qty_3_scales_discount()
    {
        var line = OrderEmailPricing.FromItem(Item(
            name: "Black Aura Luxe Bag",
            qty: 3,
            unitPrice: 2500,
            discount: 750,
            total: 7500));

        Assert.Equal(8250m, line.OriginalLineTotal);
        Assert.Equal(7500m, line.PaidLineTotal);
        Assert.Equal(750m, line.DiscountLineTotal);
    }

    [Fact]
    public void Bundle_launch_pricing_from_persisted_discount()
    {
        var line = OrderEmailPricing.FromItem(Item(
            name: "Complete Crochet Collection",
            qty: 1,
            unitPrice: 999,
            discount: 998,
            total: 999,
            itemType: OrderItemType.CourseBundle));

        Assert.True(line.HasOffer);
        Assert.Equal(1997m, line.OriginalLineTotal);
        Assert.Equal(999m, line.PaidLineTotal);
        Assert.Equal(998m, line.DiscountLineTotal);
    }

    [Fact]
    public void Bundle_regular_pricing_from_persisted_discount()
    {
        var line = OrderEmailPricing.FromItem(Item(
            name: "Complete Crochet Collection",
            qty: 1,
            unitPrice: 1699,
            discount: 298,
            total: 1699,
            itemType: OrderItemType.CourseBundle));

        Assert.True(line.HasOffer);
        Assert.Equal(1997m, line.OriginalLineTotal);
        Assert.Equal(1699m, line.PaidLineTotal);
        Assert.Equal(298m, line.DiscountLineTotal);
    }

    [Fact]
    public void No_discounts_subtotal_equals_total_paid()
    {
        var order = new Order { Subtotal = 1099m, DiscountAmount = 0m, TotalAmount = 1099m };
        var items = new[]
        {
            Item("Pink Yarn", 1, 899, 0, 899),
            Item("Bag rings", 1, 200, 0, 200)
        };

        var summary = OrderEmailPricing.FromOrder(order, items);

        Assert.Equal(1099m, summary.SubtotalBeforeDiscount);
        Assert.Equal(0m, summary.TotalSavings);
        Assert.Equal(1099m, summary.TotalPaid);
        Assert.All(summary.Items, i => Assert.False(i.HasOffer));
    }

    [Fact]
    public void Order_confirmation_html_shows_strikethrough_and_corrected_subtotal()
    {
        var customer = new Customer { FullName = "Naveen", Email = "n@example.com" };
        var order = new Order
        {
            OrderNumber = "VIVI-20260922-900682",
            Subtotal = 3599m,
            DiscountAmount = 250m,
            TotalAmount = 3599m,
            CreatedAt = new DateTime(2026, 9, 22, 0, 0, 0, DateTimeKind.Utc),
            ConfirmedAt = new DateTime(2026, 9, 22, 0, 0, 0, DateTimeKind.Utc)
        };
        var items = new[]
        {
            Item("Pink Yarn", 1, 899, 0, 899),
            Item("Bag rings", 1, 200, 0, 200),
            Item("Black Aura Luxe Bag", 1, 2500, 250, 2500)
        };

        var (_, html, text) = OrderConfirmationEmail.Render(customer, order, items);

        Assert.Contains("text-decoration:line-through", html);
        Assert.Contains(EmailLayout.FormatInr(2750m), html);
        Assert.Contains(EmailLayout.FormatInr(3849m), html);
        Assert.Contains(EmailLayout.FormatInr(250m), html);
        Assert.Contains(EmailLayout.FormatInr(3599m), html);
        Assert.DoesNotContain($"Subtotal</td><td align=\"right\">{EmailLayout.FormatInr(3599m)}", html);

        Assert.Contains("Pink Yarn x1:", text);
        Assert.Contains("Black Aura Luxe Bag x1:", text);
        Assert.Contains("→", text);
        Assert.Contains($"Subtotal: {EmailLayout.FormatInr(3849m)}", text);
        Assert.Contains($"MRP savings: -{EmailLayout.FormatInr(250m)}", text);
        Assert.Contains($"Total paid: {EmailLayout.FormatInr(3599m)}", text);
    }

    private static OrderItem Item(
        string name,
        int qty,
        decimal unitPrice,
        decimal discount,
        decimal total,
        OrderItemType itemType = OrderItemType.Product) =>
        new()
        {
            Id = Guid.NewGuid(),
            ItemType = itemType,
            Quantity = qty,
            UnitPrice = unitPrice,
            DiscountAmount = discount,
            TotalAmount = total,
            ItemNameSnapshot = name
        };
}
