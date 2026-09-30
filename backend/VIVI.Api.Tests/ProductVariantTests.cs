using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using VIVI.Api.DTOs.Products;
using Xunit;

namespace VIVI.Api.Tests;

public sealed class ProductVariantTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;
    private static readonly JsonSerializerOptions Json = AuthTests.Json;

    public ProductVariantTests(ApiFactory factory) => _factory = factory;

    private async Task<HttpClient> AdminAsync()
    {
        var client = _factory.CreateClient();
        AuthTests.WithToken(client, await AuthTests.LoginAsync(client));
        return client;
    }

    private static async Task<ProductResponse> CreateAsync(
        HttpClient admin,
        object body,
        bool publish = false)
    {
        var res = await admin.PostAsJsonAsync("/api/products", body);
        res.EnsureSuccessStatusCode();
        var product = (await res.Content.ReadFromJsonAsync<ProductResponse>(Json))!;
        if (publish)
            (await admin.PostAsync($"/api/products/{product.Id}/publish", null)).EnsureSuccessStatusCode();
        return product;
    }

    [Fact]
    public async Task Parent_with_variants_lists_once_and_detail_returns_variants()
    {
        var admin = await AdminAsync();
        var tag = Guid.NewGuid().ToString("N")[..6];

        var parent = await CreateAsync(admin, new
        {
            name = "Yarn Geire " + tag,
            category = "Yarn",
            price = 0,
            availableStock = 0,
            productType = 1,
            variantOptionName = "Colour",
            ballWeight = "50 g"
        }, publish: true);

        var red = await CreateAsync(admin, new
        {
            name = parent.Name,
            category = "Yarn",
            price = 124,
            mrp = 130,
            availableStock = 8,
            productType = 1,
            parentProductId = parent.Id,
            productCode = "DISR" + tag,
            colourName = "Red",
            colourHex = "#FF0000"
        }, publish: true);

        var black = await CreateAsync(admin, new
        {
            name = parent.Name,
            category = "Yarn",
            price = 120,
            availableStock = 3,
            productType = 1,
            parentProductId = parent.Id,
            productCode = "DISB" + tag,
            colourName = "Black",
            colourHex = "#111111"
        }, publish: true);

        var list = await _factory.CreateClient()
            .GetFromJsonAsync<List<ProductResponse>>("/api/products?productType=Resell", Json);
        Assert.Contains(list!, p => p.Id == parent.Id);
        Assert.DoesNotContain(list!, p => p.Id == red.Id || p.Id == black.Id);
        var listed = list!.Single(p => p.Id == parent.Id);
        Assert.Equal(2, listed.VariantCount);

        var detail = await _factory.CreateClient()
            .GetFromJsonAsync<ProductResponse>($"/api/products/{parent.Id}", Json);
        Assert.Equal("Colour", detail!.VariantOptionName);
        Assert.Equal(2, detail.Variants.Count);
        Assert.Contains(detail.Variants, v => v.Id == red.Id && v.ColourName == "Red" && v.ProductCode == "DISR" + tag);
        Assert.Equal(11, detail.AvailableStock);

        // Deep link to a variant still returns the sibling picker.
        var viaVariant = await _factory.CreateClient()
            .GetFromJsonAsync<ProductResponse>($"/api/products/{red.Id}", Json);
        Assert.Equal(parent.Id, viaVariant!.ParentProductId);
        Assert.Equal(2, viaVariant.Variants.Count);
    }

    [Fact]
    public async Task Nested_variants_and_room_mismatch_are_rejected()
    {
        var admin = await AdminAsync();
        var tag = Guid.NewGuid().ToString("N")[..6];

        var parent = await CreateAsync(admin, new
        {
            name = "Parent " + tag, category = "Yarn", price = 1, availableStock = 1, productType = 1
        });
        var child = await CreateAsync(admin, new
        {
            name = parent.Name, category = "Yarn", price = 1, availableStock = 1, productType = 1,
            parentProductId = parent.Id, colourName = "Cream"
        });

        var nested = await admin.PostAsJsonAsync("/api/products", new
        {
            name = "Nested", category = "Yarn", price = 1, availableStock = 1, productType = 1,
            parentProductId = child.Id
        });
        Assert.Equal(HttpStatusCode.BadRequest, nested.StatusCode);

        var handmadeParent = await CreateAsync(admin, new
        {
            name = "Bag " + tag, category = "Bags", price = 1, availableStock = 1, productType = 0
        });
        var mismatch = await admin.PostAsJsonAsync("/api/products", new
        {
            name = "Bad", category = "Yarn", price = 1, availableStock = 1, productType = 1,
            parentProductId = handmadeParent.Id
        });
        Assert.Equal(HttpStatusCode.BadRequest, mismatch.StatusCode);
    }

    [Fact]
    public async Task Cannot_delete_parent_while_variants_exist()
    {
        var admin = await AdminAsync();
        var tag = Guid.NewGuid().ToString("N")[..6];
        var parent = await CreateAsync(admin, new
        {
            name = "Del " + tag, category = "Yarn", price = 0, availableStock = 0, productType = 1
        });
        await CreateAsync(admin, new
        {
            name = parent.Name, category = "Yarn", price = 10, availableStock = 1, productType = 1,
            parentProductId = parent.Id, colourName = "Blue"
        });

        var del = await admin.DeleteAsync($"/api/products/{parent.Id}");
        Assert.Equal(HttpStatusCode.Conflict, del.StatusCode);
        Assert.Contains("PRODUCT_HAS_VARIANTS", await del.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Draft_variants_hidden_from_public_detail()
    {
        var admin = await AdminAsync();
        var tag = Guid.NewGuid().ToString("N")[..6];
        var parent = await CreateAsync(admin, new
        {
            name = "Mix " + tag, category = "Yarn", price = 0, availableStock = 0, productType = 1
        }, publish: true);
        var live = await CreateAsync(admin, new
        {
            name = parent.Name, category = "Yarn", price = 10, availableStock = 2, productType = 1,
            parentProductId = parent.Id, colourName = "Live", productCode = "L" + tag
        }, publish: true);
        await CreateAsync(admin, new
        {
            name = parent.Name, category = "Yarn", price = 10, availableStock = 2, productType = 1,
            parentProductId = parent.Id, colourName = "Draft", productCode = "D" + tag
        });

        var pub = await _factory.CreateClient().GetFromJsonAsync<ProductResponse>($"/api/products/{parent.Id}", Json);
        Assert.Single(pub!.Variants);
        Assert.Equal(live.Id, pub.Variants[0].Id);

        var adminView = await admin.GetFromJsonAsync<ProductResponse>($"/api/products/{parent.Id}", Json);
        Assert.Equal(2, adminView!.Variants.Count);
    }
}
