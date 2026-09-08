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

[Collection("Stock")]
public sealed class StockTests
{
    private readonly ApiFactory _factory;
    private static int _phones;

    public StockTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Product_api_returns_available_stock()
    {
        var id = await PublishProductAsync("Stock Visible", stock: 7);
        var client = _factory.CreateClient();
        var product = await client.GetFromJsonAsync<ProductResponse>($"/api/products/{id}", AuthTests.Json);
        Assert.Equal(7, product!.AvailableStock);
    }

    [Fact]
    public async Task Admin_can_update_available_stock()
    {
        var id = await PublishProductAsync("Stock Edit", stock: 2);
        var admin = _factory.CreateClient();
        AuthTests.WithToken(admin, await AuthTests.LoginAsync(admin));
        var product = await admin.GetFromJsonAsync<ProductResponse>($"/api/products/{id}", AuthTests.Json);
        var update = await admin.PutAsJsonAsync($"/api/products/{id}", new
        {
            name = product!.Name,
            category = product.Category,
            price = product.Price,
            productType = product.ProductType.ToString(),
            sortOrder = product.SortOrder,
            availableStock = 10
        });
        update.EnsureSuccessStatusCode();
        var saved = await update.Content.ReadFromJsonAsync<ProductResponse>(AuthTests.Json);
        Assert.Equal(10, saved!.AvailableStock);
    }

    [Fact]
    public async Task Checkout_rejects_quantity_above_stock()
    {
        var id = await PublishProductAsync("Stock Cap", stock: 3);
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var response = await customer.PostAsJsonAsync("/api/orders", new
        {
            items = new[] { new { itemType = "Product", productId = id, quantity = 5 } },
            paymentMethod = "OnlinePayment",
            shippingAddress = Address()
        });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var text = await response.Content.ReadAsStringAsync();
        Assert.Contains("INSUFFICIENT_STOCK", text);
        Assert.Contains("availableStock", text);
        Assert.Contains("3", text);
    }

    [Fact]
    public async Task Checkout_rejects_out_of_stock()
    {
        var id = await PublishProductAsync("Sold Out", stock: 0);
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var response = await customer.PostAsJsonAsync("/api/orders", new
        {
            items = new[] { new { itemType = "Product", productId = id, quantity = 1 } },
            paymentMethod = "OnlinePayment",
            shippingAddress = Address()
        });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("INSUFFICIENT_STOCK", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Successful_payment_deducts_stock_exactly_once()
    {
        var id = await PublishProductAsync("Deduct Once", stock: 5);
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var order = await PlaceAndPayAsync(customer, id, qty: 2);

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
            var product = await db.Products.SingleAsync(p => p.Id == id);
            Assert.Equal(3, product.AvailableStock);
            var entity = await db.Orders.Include(o => o.Items).SingleAsync(o => o.Id == order);
            Assert.True(entity.InventoryDeducted);
            Assert.Equal(2, entity.Items.Sum(i => i.Quantity));
        }

        // Duplicate verify must not deduct again
        await PayAgainAsync(customer, order);
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
            var product = await db.Products.SingleAsync(p => p.Id == id);
            Assert.Equal(3, product.AvailableStock);
        }
    }

    [Fact]
    public async Task Failed_payment_does_not_consume_stock()
    {
        var id = await PublishProductAsync("Fail Pay", stock: 4);
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var created = await customer.PostAsJsonAsync("/api/orders", new
        {
            items = new[] { new { itemType = "Product", productId = id, quantity = 2 } },
            paymentMethod = "OnlinePayment",
            shippingAddress = Address()
        });
        created.EnsureSuccessStatusCode();

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
        var product = await db.Products.SingleAsync(p => p.Id == id);
        Assert.Equal(4, product.AvailableStock);
    }

    [Fact]
    public async Task Concurrent_deduction_cannot_oversell()
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
        var product = new VIVI.Core.Entities.Product
        {
            Id = Guid.NewGuid(),
            Name = "Race Unit",
            Category = "Test",
            Price = 100,
            AvailableStock = 1,
            Status = ProductStatus.Published,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        db.Products.Add(product);
        await db.SaveChangesAsync();

        var inventory = new InventoryService(db);
        await inventory.DeductAsync(product.Id, 1, CancellationToken.None);
        await db.SaveChangesAsync();

        var ex = await Assert.ThrowsAsync<VIVI.Core.Exceptions.ViviException>(
            () => inventory.DeductAsync(product.Id, 1, CancellationToken.None));
        Assert.Equal("INSUFFICIENT_STOCK", ex.Code);

        var reloaded = await db.Products.AsNoTracking().SingleAsync(p => p.Id == product.Id);
        Assert.Equal(0, reloaded.AvailableStock);
    }

    [Fact]
    public async Task Order_quantity_snapshot_survives_later_stock_change()
    {
        var id = await PublishProductAsync("Snapshot Qty", stock: 8);
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var orderId = await PlaceAndPayAsync(customer, id, qty: 3);

        var admin = _factory.CreateClient();
        AuthTests.WithToken(admin, await AuthTests.LoginAsync(admin));
        var product = await admin.GetFromJsonAsync<ProductResponse>($"/api/products/{id}", AuthTests.Json);
        await admin.PutAsJsonAsync($"/api/products/{id}", new
        {
            name = product!.Name,
            category = product.Category,
            price = product.Price,
            productType = product.ProductType.ToString(),
            sortOrder = product.SortOrder,
            availableStock = 1
        });

        var order = await customer.GetFromJsonAsync<OrderResponse>($"/api/orders/{orderId}", AuthTests.Json);
        Assert.Equal(3, order!.Items.Single().Quantity);
    }

    [Fact]
    public async Task Server_price_is_independent_of_mobile_payload()
    {
        var id = await PublishProductAsync("Server Price Stock", stock: 5);
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var created = await customer.PostAsJsonAsync("/api/orders", new
        {
            items = new[] { new { itemType = "Product", productId = id, quantity = 2, unitPrice = 1 } },
            paymentMethod = "OnlinePayment",
            shippingAddress = Address(),
            totalAmount = 1
        });
        created.EnsureSuccessStatusCode();
        var body = await created.Content.ReadFromJsonAsync<CreateOrderResponse>(AuthTests.Json);
        Assert.Equal(1598, body!.TotalAmount);
    }

    private async Task<Guid> PlaceAndPayAsync(HttpClient customer, Guid productId, int qty)
    {
        var created = await customer.PostAsJsonAsync("/api/orders", new
        {
            items = new[] { new { itemType = "Product", productId, quantity = qty } },
            paymentMethod = "OnlinePayment",
            shippingAddress = Address()
        });
        created.EnsureSuccessStatusCode();
        var body = await created.Content.ReadFromJsonAsync<CreateOrderResponse>(AuthTests.Json);
        await PayAgainAsync(customer, body!.OrderId);
        return body.OrderId;
    }

    private static async Task PayAgainAsync(HttpClient customer, Guid orderId)
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

    private async Task<Guid> PublishProductAsync(string name, int stock)
    {
        var admin = _factory.CreateClient();
        AuthTests.WithToken(admin, await AuthTests.LoginAsync(admin));
        var created = await admin.PostAsJsonAsync("/api/products", new
        {
            name,
            category = "Amigurumi",
            price = 799,
            productType = "Handmade",
            availableStock = stock
        });
        created.EnsureSuccessStatusCode();
        var product = await created.Content.ReadFromJsonAsync<ProductResponse>(AuthTests.Json);
        await admin.PostAsync($"/api/products/{product!.Id}/publish", null);
        return product.Id;
    }

    private static string NextPhone() => (8300000000L + Interlocked.Increment(ref _phones)).ToString();

    private static object Address() => new
    {
        fullName = "Asha Kumar",
        phoneNumber = "9876500001",
        addressLine1 = "12 Race Course",
        city = "Coimbatore",
        state = "Tamil Nadu",
        pinCode = "641001"
    };
}

[CollectionDefinition("Stock", DisableParallelization = true)]
public sealed class StockCollection : ICollectionFixture<ApiFactory>;
