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

    [Fact]
    public async Task Paged_list_returns_a_slice_with_total_and_unpaged_list_is_unchanged()
    {
        var admin = _factory.CreateClient();
        AuthTests.WithToken(admin, await AuthTests.LoginAsync(admin));
        for (var i = 0; i < 3; i++)
        {
            var created = await admin.PostAsJsonAsync("/api/products", new { name = $"Paging Item {i}", category = "Paging", price = 100 });
            var product = await created.Content.ReadFromJsonAsync<ProductResponse>(Json);
            (await admin.PostAsync($"/api/products/{product!.Id}/publish", null)).EnsureSuccessStatusCode();
        }

        var anonymous = _factory.CreateClient();
        var all = await anonymous.GetFromJsonAsync<List<ProductResponse>>("/api/products?category=Paging", Json);
        var first = await anonymous.GetAsync("/api/products?category=Paging&page=1&pageSize=2");
        var second = await anonymous.GetAsync("/api/products?category=Paging&page=2&pageSize=2");
        var firstItems = await first.Content.ReadFromJsonAsync<List<ProductResponse>>(Json);
        var secondItems = await second.Content.ReadFromJsonAsync<List<ProductResponse>>(Json);

        Assert.Equal(3, all!.Count);
        Assert.Equal("3", first.Headers.GetValues("X-Total-Count").Single());
        Assert.Equal(all.Take(2).Select(p => p.Id), firstItems!.Select(p => p.Id));
        Assert.Equal(all.Skip(2).Select(p => p.Id), secondItems!.Select(p => p.Id));
    }
}
