using System.Net;
using System.Net.Http.Json;
using VIVI.Api.DTOs.Products;
using Xunit;

namespace VIVI.Api.Tests;

public sealed class YarnLimitTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public YarnLimitTests(ApiFactory factory) => _factory = factory;

    private static async Task<Guid> PublishYarnAsync(HttpClient admin, string name)
    {
        var created = await admin.PostAsJsonAsync("/api/products", new
        {
            name,
            category = "Yarn",
            price = 95,
            productType = "Resell",
            availableStock = 50
        });
        created.EnsureSuccessStatusCode();
        var product = (await created.Content.ReadFromJsonAsync<ProductResponse>(AuthTests.Json))!;
        (await admin.PostAsync($"/api/products/{product.Id}/publish", null)).EnsureSuccessStatusCode();
        return product.Id;
    }

    private static Task<HttpResponseMessage> OrderAsync(HttpClient customer, params (Guid ProductId, int Qty)[] lines) =>
        customer.PostAsJsonAsync("/api/orders", new
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

    [Fact]
    public async Task Yarn_limit_counts_every_yarn_line_in_the_order()
    {
        var admin = _factory.CreateClient();
        AuthTests.WithToken(admin, await AuthTests.LoginAsync(admin));
        var tag = Guid.NewGuid().ToString("N")[..5];
        var shadeA = await PublishYarnAsync(admin, $"Yarn A {tag}");
        var shadeB = await PublishYarnAsync(admin, $"Yarn B {tag}");
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient());

        var tooMany = await OrderAsync(customer, (shadeA, 6), (shadeB, 6));
        Assert.Equal(HttpStatusCode.Conflict, tooMany.StatusCode);
        Assert.Contains("YARN_LIMIT_EXCEEDED", await tooMany.Content.ReadAsStringAsync());

        var atLimit = await OrderAsync(customer, (shadeA, 5), (shadeB, 5));
        Assert.Equal(HttpStatusCode.Created, atLimit.StatusCode);
    }
}
