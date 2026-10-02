using System.Net.Http.Json;
using VIVI.Api.DTOs.Orders;
using VIVI.Api.DTOs.Products;
using VIVI.Core.Enums;
using VIVI.Infrastructure.Commerce;
using Xunit;

namespace VIVI.Api.Tests;

/// <summary>Crochet Essentials delivery charge: Rs 79 inside Tamil Nadu, Rs 100 elsewhere in India.</summary>
public sealed class ShippingChargeTests
{
    private const int Price = 799;
    private static int _phones;

    private static string NextPhone() => $"76{Interlocked.Increment(ref _phones):D8}";

    private static async Task<Guid> PublishAsync(ApiFactory factory, string name, ProductType type)
    {
        var admin = factory.CreateClient();
        AuthTests.WithToken(admin, await AuthTests.LoginAsync(admin));
        var created = await admin.PostAsJsonAsync("/api/products", new
        {
            name,
            category = "Amigurumi",
            price = Price,
            productType = type.ToString(),
            availableStock = 50
        });
        created.EnsureSuccessStatusCode();
        var product = await created.Content.ReadFromJsonAsync<ProductResponse>(AuthTests.Json);
        (await admin.PostAsync($"/api/products/{product!.Id}/publish", null)).EnsureSuccessStatusCode();
        return product.Id;
    }

    private static object Address(string state) => new
    {
        fullName = "Asha Kumar",
        phoneNumber = "9876500001",
        addressLine1 = "12 Race Course",
        city = "Salem",
        state,
        pinCode = "636001"
    };

    private static async Task<CreateOrderResponse> OrderAsync(
        ApiFactory factory, string state, params (Guid ProductId, int Quantity)[] lines)
    {
        var customer = await AuthTests.LoginCustomerAsync(factory.CreateClient(), NextPhone());
        var response = await customer.PostAsJsonAsync("/api/orders", new
        {
            items = lines.Select(l => new { itemType = "Product", productId = l.ProductId, quantity = l.Quantity }),
            paymentMethod = "OnlinePayment",
            shippingAddress = Address(state)
        });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<CreateOrderResponse>(AuthTests.Json))!;
    }

    [Fact]
    public async Task Essentials_in_tamil_nadu_cost_79_delivery()
    {
        await using var factory = new ApiFactory();
        var essentials = await PublishAsync(factory, "Stitch Markers TN", ProductType.Resell);

        var order = await OrderAsync(factory, "Tamil Nadu", (essentials, 1));

        Assert.Equal(Price + 79, order.TotalAmount);
        Assert.Equal(79, order.Delivery!.ShippingAmount);
        Assert.Equal((Price + 79) * 100, order.AmountPaise);
    }

    [Fact]
    public async Task Essentials_outside_tamil_nadu_cost_100_delivery()
    {
        await using var factory = new ApiFactory();
        var essentials = await PublishAsync(factory, "Stitch Markers KA", ProductType.Resell);

        var order = await OrderAsync(factory, "Karnataka", (essentials, 1));

        Assert.Equal(Price + 100, order.TotalAmount);
        Assert.Equal(100, order.Delivery!.ShippingAmount);
    }

    [Fact]
    public async Task The_charge_is_once_per_order_not_per_item()
    {
        await using var factory = new ApiFactory();
        var a = await PublishAsync(factory, "Essential A", ProductType.Resell);
        var b = await PublishAsync(factory, "Essential B", ProductType.Resell);

        var order = await OrderAsync(factory, "Tamil Nadu", (a, 3), (b, 2));

        Assert.Equal(Price * 5 + 79, order.TotalAmount);
    }

    [Fact]
    public async Task Handmade_only_orders_have_no_delivery_charge()
    {
        await using var factory = new ApiFactory();
        var handmade = await PublishAsync(factory, "Handmade Bag", ProductType.Handmade);

        var order = await OrderAsync(factory, "Tamil Nadu", (handmade, 1));

        Assert.Equal(Price, order.TotalAmount);
        Assert.Equal(0, order.Delivery!.ShippingAmount);
    }

    [Fact]
    public async Task A_cart_with_handmade_and_essentials_pays_the_essentials_charge_once()
    {
        await using var factory = new ApiFactory();
        var handmade = await PublishAsync(factory, "Handmade Mix", ProductType.Handmade);
        var essentials = await PublishAsync(factory, "Essentials Mix", ProductType.Resell);

        var order = await OrderAsync(factory, "Kerala", (handmade, 1), (essentials, 1));

        Assert.Equal(Price * 2 + 100, order.TotalAmount);
    }

    [Fact]
    public async Task The_delivery_quote_shows_the_charge_before_the_customer_pays()
    {
        await using var factory = new ApiFactory();
        var essentials = await PublishAsync(factory, "Quote Essentials", ProductType.Resell);
        var customer = await AuthTests.LoginCustomerAsync(factory.CreateClient(), NextPhone());

        async Task<decimal> QuoteAsync(string state)
        {
            var response = await customer.PostAsJsonAsync("/api/orders/delivery-quote", new
            {
                items = new[] { new { itemType = "Product", productId = essentials, quantity = 1 } },
                shippingAddress = Address(state)
            });
            response.EnsureSuccessStatusCode();
            return (await response.Content.ReadFromJsonAsync<DeliveryQuoteResponse>(AuthTests.Json))!.ShippingAmount;
        }

        Assert.Equal(79, await QuoteAsync("Tamil Nadu"));
        Assert.Equal(100, await QuoteAsync("Maharashtra"));
    }

    [Theory]
    [InlineData("Tamil Nadu", true)]
    [InlineData("TAMIL NADU", true)]
    [InlineData("tamilnadu", true)]
    [InlineData("  Tamil  Nadu ", true)]
    [InlineData("TN", true)]
    [InlineData("Karnataka", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void Tamil_nadu_is_recognised_however_it_is_typed(string? state, bool expected) =>
        Assert.Equal(expected, ShippingChargeCalculator.IsTamilNadu(state));

    [Fact]
    public void International_orders_are_not_charged_the_rupee_fee()
    {
        var calculator = new ShippingChargeCalculator(new ShippingChargeSettings());

        Assert.Equal(0, calculator.ForOrder("USD", [ProductType.Resell], "Tamil Nadu"));
        Assert.Equal(79, calculator.ForOrder("INR", [ProductType.Resell], "Tamil Nadu"));
        Assert.Equal(0, calculator.ForOrder("INR", [ProductType.Handmade], "Tamil Nadu"));
    }

    [Fact]
    public void The_amounts_can_be_changed_in_settings()
    {
        var calculator = new ShippingChargeCalculator(new ShippingChargeSettings { TamilNaduInr = 60, OtherStatesInr = 90 });

        Assert.Equal(60, calculator.ForOrder("INR", [ProductType.Resell], "Tamil Nadu"));
        Assert.Equal(90, calculator.ForOrder("INR", [ProductType.Resell], "Delhi"));
    }
}
