using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using VIVI.Api.DTOs.Orders;
using VIVI.Api.DTOs.Products;
using VIVI.Core.Enums;
using VIVI.Infrastructure.Commerce;
using VIVI.Infrastructure.Data;
using Xunit;

namespace VIVI.Api.Tests;

[Collection("Delivery")]
public sealed class DeliveryTests
{
    private readonly ApiFactory _factory;
    private static int _phones;

    public DeliveryTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Handmade_coimbatore_is_next_day()
    {
        var quote = await QuoteAsync(await PublishProductAsync("Handmade", ProductType.Handmade), "Coimbatore");
        Assert.True(quote.IsCoimbatore);
        Assert.Equal(1, quote.MinDays);
        Assert.Equal(1, quote.MaxDays);
        Assert.Equal("Tomorrow", quote.Summary);
    }

    [Fact]
    public async Task Handmade_outside_coimbatore_is_two_to_three_days()
    {
        var quote = await QuoteAsync(await PublishProductAsync("Handmade Out", ProductType.Handmade), "Chennai");
        Assert.False(quote.IsCoimbatore);
        Assert.Equal(2, quote.MinDays);
        Assert.Equal(3, quote.MaxDays);
        Assert.Equal("2–3 days", quote.Summary);
    }

    [Fact]
    public async Task Resell_coimbatore_is_one_to_two_days()
    {
        var quote = await QuoteAsync(await PublishProductAsync("Resell", ProductType.Resell), "Coimbatore");
        Assert.True(quote.IsCoimbatore);
        Assert.Equal(1, quote.MinDays);
        Assert.Equal(2, quote.MaxDays);
        Assert.Equal("1–2 days", quote.Summary);
    }

    [Fact]
    public async Task Resell_outside_coimbatore_is_one_to_two_days()
    {
        var quote = await QuoteAsync(await PublishProductAsync("Resell Out", ProductType.Resell), "Madurai");
        Assert.False(quote.IsCoimbatore);
        Assert.Equal(1, quote.MinDays);
        Assert.Equal(2, quote.MaxDays);
    }

    [Fact]
    public async Task Mixed_physical_products_use_longest_range()
    {
        var handmade = await PublishProductAsync("HM Mix", ProductType.Handmade);
        var resell = await PublishProductAsync("RS Mix", ProductType.Resell);
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var quote = await customer.PostAsJsonAsync("/api/orders/delivery-quote", new
        {
            items = new[]
            {
                new { itemType = "Product", productId = handmade, quantity = 1 },
                new { itemType = "Product", productId = resell, quantity = 1 }
            },
            shippingAddress = Address("Coimbatore")
        });
        quote.EnsureSuccessStatusCode();
        var body = await quote.Content.ReadFromJsonAsync<DeliveryQuoteResponse>(AuthTests.Json);
        Assert.Equal(1, body!.MinDays);
        Assert.Equal(2, body.MaxDays);

        var outside = await customer.PostAsJsonAsync("/api/orders/delivery-quote", new
        {
            items = new[]
            {
                new { itemType = "Product", productId = handmade, quantity = 1 },
                new { itemType = "Product", productId = resell, quantity = 1 }
            },
            shippingAddress = Address("Chennai")
        });
        var outsideBody = await outside.Content.ReadFromJsonAsync<DeliveryQuoteResponse>(AuthTests.Json);
        Assert.Equal(2, outsideBody!.MinDays);
        Assert.Equal(3, outsideBody.MaxDays);
    }

    [Theory]
    [InlineData("COIMBATORE")]
    [InlineData("coimbatore")]
    [InlineData("Coimbatore South")]
    public async Task Coimbatore_capitalization_is_normalized(string city)
    {
        var quote = await QuoteAsync(await PublishProductAsync($"City {city}", ProductType.Handmade), city);
        Assert.True(quote.IsCoimbatore);
        Assert.Equal(1, quote.MaxDays);
    }

    [Fact]
    public async Task Invalid_pin_is_rejected()
    {
        var productId = await PublishProductAsync("Pin", ProductType.Handmade);
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var response = await customer.PostAsJsonAsync("/api/orders/delivery-quote", new
        {
            items = new[] { new { itemType = "Product", productId, quantity = 1 } },
            shippingAddress = Address("Coimbatore") with { PinCode = "12" }
        });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Missing_delivery_address_is_rejected_for_products()
    {
        var productId = await PublishProductAsync("No Addr", ProductType.Handmade);
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var response = await customer.PostAsJsonAsync("/api/orders", new
        {
            items = new[] { new { itemType = "Product", productId, quantity = 1 } },
            paymentMethod = "OnlinePayment"
        });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var text = await response.Content.ReadAsStringAsync();
        Assert.Contains("DELIVERY_ADDRESS_REQUIRED", text);
    }

    [Fact]
    public async Task Course_does_not_require_delivery_address()
    {
        var (customer, courseId) = await OrderTestsHelper.CustomerWithPublishedCourse(_factory, NextPhone());
        var response = await customer.PostAsJsonAsync("/api/orders", new
        {
            items = new[] { new { itemType = "Course", courseId, quantity = 1 } },
            paymentMethod = "OnlinePayment"
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<CreateOrderResponse>(AuthTests.Json);
        Assert.Null(body!.Delivery);
    }

    [Fact]
    public async Task Course_cannot_use_delivery_quote()
    {
        var (customer, courseId) = await OrderTestsHelper.CustomerWithPublishedCourse(_factory, NextPhone());
        var response = await customer.PostAsJsonAsync("/api/orders/delivery-quote", new
        {
            items = new[] { new { itemType = "Course", courseId, quantity = 1 } },
            shippingAddress = Address("Coimbatore")
        });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Cod_request_is_rejected_and_does_not_create_razorpay_order()
    {
        var productId = await PublishProductAsync("COD Block", ProductType.Handmade);
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var before = await CountOrdersAsync();
        var response = await customer.PostAsJsonAsync("/api/orders", new
        {
            items = new[] { new { itemType = "Product", productId, quantity = 1 } },
            paymentMethod = "COD",
            shippingAddress = Address("Coimbatore")
        });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var text = await response.Content.ReadAsStringAsync();
        Assert.Contains("COD_NOT_ALLOWED", text);
        Assert.Equal(before, await CountOrdersAsync());
    }

    [Fact]
    public async Task Mixed_product_and_course_order_is_rejected()
    {
        var productId = await PublishProductAsync("Mix Block", ProductType.Handmade);
        var (customer, courseId) = await OrderTestsHelper.CustomerWithPublishedCourse(_factory, NextPhone());
        var response = await customer.PostAsJsonAsync("/api/orders", new
        {
            items = new object[]
            {
                new { itemType = "Product", productId, quantity = 1 },
                new { itemType = "Course", courseId, quantity = 1 }
            },
            shippingAddress = Address("Coimbatore")
        });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("MIXED_ORDER_NOT_ALLOWED", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Server_calculates_delivery_and_ignores_mobile_override()
    {
        var productId = await PublishProductAsync("Server Price", ProductType.Handmade);
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var created = await customer.PostAsJsonAsync("/api/orders", new
        {
            items = new[] { new { itemType = "Product", productId, quantity = 1 } },
            paymentMethod = "OnlinePayment",
            shippingAddress = Address("Coimbatore"),
            estimatedDeliveryDateFrom = "2030-01-01",
            estimatedDeliveryDateTo = "2030-12-31",
            deliveryEstimateMinDays = 99,
            deliveryEstimateMaxDays = 99,
            totalAmount = 1
        });
        created.EnsureSuccessStatusCode();
        var body = await created.Content.ReadFromJsonAsync<CreateOrderResponse>(AuthTests.Json);
        Assert.Equal(1, body!.Delivery!.MinDays);
        Assert.Equal(1, body.Delivery.MaxDays);
        Assert.NotEqual(new DateTime(2030, 1, 1), body.Delivery.EstimatedDeliveryDateFrom.Date);
        Assert.Equal("Online Payment", body.PaymentMethod);
    }

    [Fact]
    public async Task Admin_can_override_delivery_date_and_customer_sees_effective_date()
    {
        var emails = _factory.GetFakeEmailService();
        emails.Clear();
        var (customer, orderId) = await PlacePhysicalOrderAsync("Coimbatore", ProductType.Handmade);
        await PayAsync(customer, orderId);

        var admin = _factory.CreateClient();
        AuthTests.WithToken(admin, await AuthTests.LoginAsync(admin));
        var detail = await admin.GetFromJsonAsync<AdminOrderDetailResponse>($"/api/admin/orders/{orderId}", AuthTests.Json);
        Assert.False(detail!.Delivery!.IsOverridden);

        var newDate = detail.Delivery.ExpectedFrom.Date.AddDays(4);
        var update = await admin.PutAsJsonAsync($"/api/admin/orders/{orderId}/delivery-date", new
        {
            deliveryDateFrom = newDate.ToString("yyyy-MM-dd"),
            deliveryDateTo = newDate.ToString("yyyy-MM-dd"),
            reason = "Handmade production delay"
        });
        Assert.True(update.IsSuccessStatusCode, await update.Content.ReadAsStringAsync());
        var updated = await update.Content.ReadFromJsonAsync<AdminOrderDetailResponse>(AuthTests.Json);
        Assert.True(updated!.Delivery!.IsOverridden);
        Assert.Equal(newDate, updated.Delivery.ExpectedFrom.Date);
        Assert.Contains("Handmade production delay", updated.OverrideReason);
        Assert.NotEmpty(updated.DeliveryHistory);

        var customerView = await customer.GetFromJsonAsync<OrderResponse>($"/api/orders/{orderId}", AuthTests.Json);
        Assert.True(customerView!.Delivery!.IsOverridden);
        Assert.Equal(newDate, customerView.Delivery.ExpectedFrom.Date);
        Assert.StartsWith("Expected delivery:", customerView.Delivery.CustomerLabel);
        Assert.Null(customerView.GetType().GetProperty("OverrideReason"));

        Assert.Contains(emails.SentMessages, m => m.Subject.Contains("delivery date has been updated", StringComparison.OrdinalIgnoreCase));
        var count = emails.SentMessages.Count(m => m.Subject.Contains("delivery date has been updated", StringComparison.OrdinalIgnoreCase));

        var same = await admin.PutAsJsonAsync($"/api/admin/orders/{orderId}/delivery-date", new
        {
            deliveryDateFrom = newDate,
            deliveryDateTo = newDate,
            reason = "same date"
        });
        same.EnsureSuccessStatusCode();
        var after = emails.SentMessages.Count(m => m.Subject.Contains("delivery date has been updated", StringComparison.OrdinalIgnoreCase));
        Assert.Equal(count, after);
    }

    [Fact]
    public async Task Customer_cannot_override_delivery_date()
    {
        var (customer, orderId) = await PlacePhysicalOrderAsync("Chennai", ProductType.Resell);
        var response = await customer.PutAsJsonAsync($"/api/admin/orders/{orderId}/delivery-date", new
        {
            deliveryDateFrom = DateTime.UtcNow.Date.AddDays(10),
            reason = "please delay"
        });
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);

        var self = await customer.PutAsJsonAsync($"/api/orders/{orderId}/delivery-date", new
        {
            deliveryDateFrom = DateTime.UtcNow.Date.AddDays(10)
        });
        Assert.True(self.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.MethodNotAllowed);
    }

    [Fact]
    public async Task Product_type_is_stored_and_used()
    {
        var admin = _factory.CreateClient();
        AuthTests.WithToken(admin, await AuthTests.LoginAsync(admin));
        var created = await admin.PostAsJsonAsync("/api/products", new
        {
            name = "Typed Resell",
            category = "Home",
            price = 500,
            productType = "Resell"
        });
        created.EnsureSuccessStatusCode();
        var product = await created.Content.ReadFromJsonAsync<ProductResponse>(AuthTests.Json);
        Assert.Equal(ProductType.Resell, product!.ProductType);
    }

    private async Task<DeliveryQuoteResponse> QuoteAsync(Guid productId, string city)
    {
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var response = await customer.PostAsJsonAsync("/api/orders/delivery-quote", new
        {
            items = new[] { new { itemType = "Product", productId, quantity = 1 } },
            shippingAddress = Address(city)
        });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<DeliveryQuoteResponse>(AuthTests.Json))!;
    }

    private async Task<(HttpClient Customer, Guid OrderId)> PlacePhysicalOrderAsync(string city, ProductType type)
    {
        var productId = await PublishProductAsync($"Ship {Guid.NewGuid():N}"[..12], type);
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var created = await customer.PostAsJsonAsync("/api/orders", new
        {
            items = new[] { new { itemType = "Product", productId, quantity = 1 } },
            paymentMethod = "OnlinePayment",
            shippingAddress = Address(city)
        });
        created.EnsureSuccessStatusCode();
        var body = await created.Content.ReadFromJsonAsync<CreateOrderResponse>(AuthTests.Json);
        return (customer, body!.OrderId);
    }

    private static async Task PayAsync(HttpClient customer, Guid orderId)
    {
        var order = await customer.GetFromJsonAsync<OrderResponse>($"/api/orders/{orderId}", AuthTests.Json);
        var paymentId = FakeRazorpayPaymentGateway.BuildTestPaymentId(order!.RazorpayOrderId!);
        var signature = FakeRazorpayPaymentGateway.BuildTestSignature(order.RazorpayOrderId!, paymentId);
        var verify = await customer.PostAsJsonAsync("/api/payments/razorpay/verify", new
        {
            internalOrderId = orderId,
            razorpayOrderId = order.RazorpayOrderId,
            razorpayPaymentId = paymentId,
            razorpaySignature = signature
        });
        verify.EnsureSuccessStatusCode();
    }

    private async Task<Guid> PublishProductAsync(string name, ProductType type)
    {
        var admin = _factory.CreateClient();
        AuthTests.WithToken(admin, await AuthTests.LoginAsync(admin));
        var created = await admin.PostAsJsonAsync("/api/products", new
        {
            name,
            category = "Amigurumi",
            price = 799,
            productType = type.ToString(),
            availableStock = 50
        });
        created.EnsureSuccessStatusCode();
        var product = await created.Content.ReadFromJsonAsync<ProductResponse>(AuthTests.Json);
        await admin.PostAsync($"/api/products/{product!.Id}/publish", null);
        return product.Id;
    }

    private async Task<int> CountOrdersAsync()
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
        return await db.Orders.CountAsync();
    }

    private static string NextPhone() => (8200000000L + Interlocked.Increment(ref _phones)).ToString();

    private static AddressDto Address(string city) => new(
        "Asha Kumar",
        "9876500001",
        "12 Race Course",
        city,
        "Tamil Nadu",
        "641001");

    private sealed record AddressDto(
        string FullName,
        string PhoneNumber,
        string AddressLine1,
        string City,
        string State,
        string PinCode);
}

[CollectionDefinition("Delivery", DisableParallelization = true)]
public sealed class DeliveryCollection : ICollectionFixture<ApiFactory>;
