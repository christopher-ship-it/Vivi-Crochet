using System.Net.Http.Json;
using System.Text.Json;
using VIVI.Api.DTOs.Orders;
using VIVI.Api.DTOs.Products;
using Xunit;

namespace VIVI.Api.Tests;

public sealed class AdminOrderListColumnsTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;
    private static readonly JsonSerializerOptions Json = AuthTests.Json;

    public AdminOrderListColumnsTests(ApiFactory factory) => _factory = factory;

    private static async Task<ProductResponse> CreateAsync(HttpClient admin, string type, string code)
    {
        var res = await admin.PostAsJsonAsync("/api/products", new
        {
            name = $"{type} {code}",
            category = type == "Resell" ? "Yarn" : "Bags",
            price = 100,
            productType = type,
            availableStock = 20,
            productCode = code
        });
        res.EnsureSuccessStatusCode();
        var product = (await res.Content.ReadFromJsonAsync<ProductResponse>(Json))!;
        (await admin.PostAsync($"/api/products/{product.Id}/publish", null)).EnsureSuccessStatusCode();
        return product;
    }

    private async Task<Guid> OrderAsync(HttpClient customer, params (Guid ProductId, int Qty)[] lines)
    {
        var res = await customer.PostAsJsonAsync("/api/orders", new
        {
            items = lines.Select(l => new { itemType = "Product", productId = l.ProductId, quantity = l.Qty }).ToArray(),
            shippingAddress = new
            {
                fullName = "Asha Kumar",
                phoneNumber = "9876500001",
                addressLine1 = "12 Race Course",
                city = "Coimbatore",
                state = "Tamil Nadu",
                pinCode = "641001",
                country = "India"
            }
        });
        res.EnsureSuccessStatusCode();
        return (await res.Content.ReadFromJsonAsync<CreateOrderResponse>(Json))!.OrderId;
    }

    [Fact]
    public async Task Order_list_reports_product_codes_quantity_and_room()
    {
        var admin = _factory.CreateClient();
        AuthTests.WithToken(admin, await AuthTests.LoginAsync(admin));
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient());
        var tag = Guid.NewGuid().ToString("N")[..5].ToUpperInvariant();

        var bag = await CreateAsync(admin, "Handmade", "HB" + tag);
        var yarnA = await CreateAsync(admin, "Resell", "YA" + tag);
        var yarnB = await CreateAsync(admin, "Resell", "YB" + tag);

        var handmadeOnly = await OrderAsync(customer, (bag.Id, 1));
        var essentialsOnly = await OrderAsync(customer, (yarnA.Id, 2), (yarnB.Id, 3));
        var combined = await OrderAsync(customer, (bag.Id, 1), (yarnA.Id, 4));

        var list = (await admin.GetFromJsonAsync<List<AdminOrderListItemResponse>>("/api/admin/orders", Json))!;

        var h = list.Single(o => o.Id == handmadeOnly);
        Assert.Equal("Handmade", h.ProductRoom);
        Assert.Equal(1, h.ProductQuantity);
        Assert.Equal("HB" + tag, h.ProductCodes);

        var e = list.Single(o => o.Id == essentialsOnly);
        Assert.Equal("Essentials", e.ProductRoom);
        Assert.Equal(5, e.ProductQuantity);
        Assert.Contains("YA" + tag, e.ProductCodes);
        Assert.Contains("YB" + tag, e.ProductCodes);

        var c = list.Single(o => o.Id == combined);
        Assert.Equal("Combined", c.ProductRoom);
        Assert.Equal(5, c.ProductQuantity);
    }
}
