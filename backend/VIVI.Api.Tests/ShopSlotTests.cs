using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using VIVI.Api.DTOs.Products;
using Xunit;

namespace VIVI.Api.Tests;

/// <summary>Product catalog extras formerly shipped with shop slots (codes, yarn/colour specs).</summary>
public sealed class ShopSlotTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;
    private static readonly JsonSerializerOptions Json = AuthTests.Json;

    public ShopSlotTests(ApiFactory factory) => _factory = factory;

    private async Task<HttpClient> AdminAsync()
    {
        var client = _factory.CreateClient();
        AuthTests.WithToken(client, await AuthTests.LoginAsync(client));
        return client;
    }

    // productType: 0 = Handmade, 1 = Resell
    private static async Task<ProductResponse> CreateProductAsync(
        HttpClient admin, string name, int productType, string? code = null, bool publish = true)
    {
        var res = await admin.PostAsJsonAsync("/api/products", new
        {
            name,
            category = productType == 1 ? "Yarn" : "Bags",
            price = 100,
            availableStock = 5,
            productType,
            productCode = code
        });
        res.EnsureSuccessStatusCode();
        var product = (await res.Content.ReadFromJsonAsync<ProductResponse>(Json))!;
        if (publish)
            (await admin.PostAsync($"/api/products/{product.Id}/publish", null)).EnsureSuccessStatusCode();
        return product;
    }

    [Fact]
    public async Task Essentials_specs_and_colour_are_saved_validated_and_ignored_for_handmade()
    {
        var admin = await AdminAsync();
        var tag = Guid.NewGuid().ToString("N")[..6];

        var essentials = await admin.PostAsJsonAsync("/api/products", new
        {
            name = "Spec Yarn " + tag, category = "Yarn", price = 80, availableStock = 5, productType = 1,
            ballWeight = " 50 g ", yarnLength = "120 m", crochetHookSize = "4 mm",
            colourName = "Cream", colourHex = "#f5e6a8"
        });
        essentials.EnsureSuccessStatusCode();
        var saved = (await essentials.Content.ReadFromJsonAsync<ProductResponse>(Json))!;
        Assert.Equal("50 g", saved.BallWeight);
        Assert.Equal("120 m", saved.YarnLength);
        Assert.Equal("4 mm", saved.CrochetHookSize);
        Assert.Equal("Cream", saved.ColourName);
        Assert.Equal("#F5E6A8", saved.ColourHex);

        var badHex = await admin.PostAsJsonAsync("/api/products", new
        {
            name = "Bad hex " + tag, category = "Yarn", price = 1, productType = 1, colourHex = "cream"
        });
        Assert.Equal(HttpStatusCode.BadRequest, badHex.StatusCode);

        var handmade = await admin.PostAsJsonAsync("/api/products", new
        {
            name = "Handmade " + tag, category = "Bags", price = 1, availableStock = 1, productType = 0,
            ballWeight = "50 g", colourName = "Red", colourHex = "#FF0000"
        });
        handmade.EnsureSuccessStatusCode();
        var h = (await handmade.Content.ReadFromJsonAsync<ProductResponse>(Json))!;
        Assert.Null(h.BallWeight);
        Assert.Null(h.ColourName);
        Assert.Null(h.ColourHex);
    }

    [Fact]
    public async Task Product_code_is_saved_searchable_and_unique()
    {
        var admin = await AdminAsync();
        var tag = Guid.NewGuid().ToString("N")[..6].ToUpperInvariant();
        var p = await CreateProductAsync(admin, "Code Yarn " + tag, 1, "DIS" + tag);
        Assert.Equal("DIS" + tag, p.ProductCode);

        var found = await admin.GetFromJsonAsync<List<ProductResponse>>($"/api/products?q={tag[1..5]}", Json);
        Assert.Contains(found!, x => x.Id == p.Id);

        var dup = await admin.PostAsJsonAsync("/api/products", new
        {
            name = "Other", category = "Yarn", price = 1, productType = 1, productCode = "dis" + tag
        });
        Assert.Equal(HttpStatusCode.Conflict, dup.StatusCode);

        // Products without a code are unaffected (multiple nulls allowed).
        await CreateProductAsync(admin, "No code A " + tag, 1);
        await CreateProductAsync(admin, "No code B " + tag, 1);
    }

    [Fact]
    public async Task Existing_category_product_list_still_works()
    {
        var admin = await AdminAsync();
        var tag = Guid.NewGuid().ToString("N")[..6];
        var p = await CreateProductAsync(admin, "Catalog " + tag, 1);
        var list = await _factory.CreateClient().GetFromJsonAsync<List<ProductResponse>>("/api/products?productType=Resell&category=Yarn", Json);
        Assert.Contains(list!, x => x.Id == p.Id);
    }

    [Fact]
    public async Task Shop_slot_endpoints_are_gone()
    {
        var anon = _factory.CreateClient();
        Assert.Equal(HttpStatusCode.NotFound, (await anon.GetAsync("/api/shop/slots")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anon.GetAsync("/api/admin/shop/slots")).StatusCode);
    }
}
