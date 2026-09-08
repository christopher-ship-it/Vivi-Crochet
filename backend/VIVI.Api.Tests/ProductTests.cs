using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using VIVI.Api.DTOs.Products;
using VIVI.Core.Enums;
using Xunit;

namespace VIVI.Api.Tests;

public sealed class ProductTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;
    private static readonly JsonSerializerOptions Json = AuthTests.Json;

    public ProductTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Admin_can_create_a_draft_product()
    {
        var client = _factory.CreateClient();
        AuthTests.WithToken(client, await AuthTests.LoginAsync(client));

        var response = await client.PostAsJsonAsync("/api/products", new
        {
            name = "Test Bunny",
            category = "Amigurumi",
            description = "Soft cotton bunny",
            price = 799,
            mrp = 999,
            spec1 = "12 cm",
            sortOrder = 10
        });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var product = await response.Content.ReadFromJsonAsync<ProductResponse>(Json);
        Assert.Equal("Test Bunny", product!.Name);
        Assert.Equal(ProductStatus.Draft, product.Status);
    }

    [Fact]
    public async Task Anonymous_list_hides_draft_products()
    {
        var admin = _factory.CreateClient();
        var token = await AuthTests.LoginAsync(admin);
        AuthTests.WithToken(admin, token);

        var created = await admin.PostAsJsonAsync("/api/products", new
        {
            name = "Hidden Draft Product",
            category = "Amigurumi",
            price = 500
        });
        created.EnsureSuccessStatusCode();

        var anonymous = _factory.CreateClient();
        var list = await anonymous.GetFromJsonAsync<List<ProductResponse>>("/api/products", Json);
        Assert.DoesNotContain(list!, p => p.Name == "Hidden Draft Product");
    }

    [Fact]
    public async Task Publishing_makes_product_visible()
    {
        var client = _factory.CreateClient();
        var token = await AuthTests.LoginAsync(client);
        AuthTests.WithToken(client, token);

        var created = await client.PostAsJsonAsync("/api/products", new
        {
            name = "Visible Plush",
            category = "Amigurumi",
            price = 650
        });
        var product = await created.Content.ReadFromJsonAsync<ProductResponse>(Json);

        var publish = await client.PostAsync($"/api/products/{product!.Id}/publish", null);
        publish.EnsureSuccessStatusCode();

        var anonymous = _factory.CreateClient();
        var list = await anonymous.GetFromJsonAsync<List<ProductResponse>>("/api/products", Json);
        Assert.Contains(list!, p => p.Name == "Visible Plush" && p.Status == ProductStatus.Published);
    }
}
