using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using VIVI.Api.DTOs.Products;
using VIVI.Api.DTOs.Shop;
using Xunit;

namespace VIVI.Api.Tests;

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

    private static async Task<ShopSlotResponse> CreateSlotAsync(
        HttpClient admin, string name, int productType, bool isActive = true, int displayOrder = 0)
    {
        var res = await admin.PostAsJsonAsync("/api/admin/shop/slots", new { name, productType, displayOrder, isActive });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        return (await res.Content.ReadFromJsonAsync<ShopSlotResponse>(Json))!;
    }

    private static Task<HttpResponseMessage> SetProductsAsync(HttpClient admin, Guid slotId, params Guid[] ids) =>
        admin.PutAsJsonAsync($"/api/admin/shop/slots/{slotId}/products", new { productIds = ids });

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
    public async Task One_slot_holds_many_products_in_order_and_public_api_returns_them()
    {
        var admin = await AdminAsync();
        var tag = Guid.NewGuid().ToString("N")[..6];
        var a = await CreateProductAsync(admin, "Yarn A " + tag, 1, "A" + tag);
        var b = await CreateProductAsync(admin, "Yarn B " + tag, 1, "B" + tag);
        var c = await CreateProductAsync(admin, "Yarn C " + tag, 1, "C" + tag);
        var slot = await CreateSlotAsync(admin, "Yarn " + tag, 1, displayOrder: -50);

        var res = await SetProductsAsync(admin, slot.SlotId, c.Id, a.Id, b.Id);
        res.EnsureSuccessStatusCode();
        var saved = (await res.Content.ReadFromJsonAsync<ShopSlotResponse>(Json))!;
        Assert.Equal(new[] { c.Id, a.Id, b.Id }, saved.Products.Select(x => x.Id));

        var pub = await _factory.CreateClient().GetFromJsonAsync<List<ShopSlotResponse>>("/api/shop/slots?productType=Resell", Json);
        var mine = pub!.Single(s => s.SlotId == slot.SlotId);
        Assert.Equal("Yarn " + tag, mine.SlotName);
        Assert.Equal(new[] { c.Id, a.Id, b.Id }, mine.Products.Select(x => x.Id));
        Assert.Equal("C" + tag, mine.Products[0].ProductCode);
        Assert.Equal(5, mine.Products[0].Stock);

        // Not visible in the Handmade room listing.
        var hand = await _factory.CreateClient().GetFromJsonAsync<List<ShopSlotResponse>>("/api/shop/slots?productType=Handmade", Json);
        Assert.DoesNotContain(hand!, s => s.SlotId == slot.SlotId);

        // Reorder + removal.
        var reorder = await admin.PutAsJsonAsync($"/api/admin/shop/slots/{slot.SlotId}/products/order", new { productIds = new[] { b.Id, c.Id, a.Id } });
        reorder.EnsureSuccessStatusCode();
        var reordered = (await reorder.Content.ReadFromJsonAsync<ShopSlotResponse>(Json))!;
        Assert.Equal(new[] { b.Id, c.Id, a.Id }, reordered.Products.Select(x => x.Id));

        var badReorder = await admin.PutAsJsonAsync($"/api/admin/shop/slots/{slot.SlotId}/products/order", new { productIds = new[] { b.Id, c.Id } });
        Assert.Equal(HttpStatusCode.BadRequest, badReorder.StatusCode);

        var removed = await SetProductsAsync(admin, slot.SlotId, b.Id, a.Id);
        var after = (await removed.Content.ReadFromJsonAsync<ShopSlotResponse>(Json))!;
        Assert.Equal(new[] { b.Id, a.Id }, after.Products.Select(x => x.Id));

        // Catalog product still exists after removal from the slot.
        var still = await admin.GetAsync($"/api/products/{c.Id}");
        Assert.Equal(HttpStatusCode.OK, still.StatusCode);
    }

    [Fact]
    public async Task Duplicate_products_in_one_slot_are_rejected()
    {
        var admin = await AdminAsync();
        var tag = Guid.NewGuid().ToString("N")[..6];
        var a = await CreateProductAsync(admin, "Dup " + tag, 1);
        var slot = await CreateSlotAsync(admin, "Dup slot " + tag, 1);

        var res = await SetProductsAsync(admin, slot.SlotId, a.Id, a.Id);
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Contains("DUPLICATE_PRODUCT", await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Room_mismatch_is_rejected_by_the_backend()
    {
        var admin = await AdminAsync();
        var tag = Guid.NewGuid().ToString("N")[..6];
        var handmade = await CreateProductAsync(admin, "Bag " + tag, 0);
        var essential = await CreateProductAsync(admin, "Hook " + tag, 1);
        var essentialsSlot = await CreateSlotAsync(admin, "Hooks " + tag, 1);
        var handmadeSlot = await CreateSlotAsync(admin, "Best " + tag, 0);

        var bad1 = await SetProductsAsync(admin, essentialsSlot.SlotId, essential.Id, handmade.Id);
        Assert.Equal(HttpStatusCode.BadRequest, bad1.StatusCode);
        Assert.Contains("PRODUCT_TYPE_MISMATCH", await bad1.Content.ReadAsStringAsync());

        var bad2 = await SetProductsAsync(admin, handmadeSlot.SlotId, essential.Id);
        Assert.Equal(HttpStatusCode.BadRequest, bad2.StatusCode);

        var ok = await SetProductsAsync(admin, handmadeSlot.SlotId, handmade.Id);
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);

        var missing = await SetProductsAsync(admin, essentialsSlot.SlotId, Guid.NewGuid());
        Assert.Equal(HttpStatusCode.BadRequest, missing.StatusCode);
    }

    [Fact]
    public async Task Inactive_slot_is_hidden_and_not_editable()
    {
        var admin = await AdminAsync();
        var tag = Guid.NewGuid().ToString("N")[..6];
        var a = await CreateProductAsync(admin, "Inact " + tag, 1);
        var slot = await CreateSlotAsync(admin, "Toggle " + tag, 1);
        (await SetProductsAsync(admin, slot.SlotId, a.Id)).EnsureSuccessStatusCode();

        var off = await admin.PutAsJsonAsync($"/api/admin/shop/slots/{slot.SlotId}", new
        {
            name = slot.SlotName, productType = 1, displayOrder = 0, isActive = false
        });
        off.EnsureSuccessStatusCode();

        var pub = await _factory.CreateClient().GetFromJsonAsync<List<ShopSlotResponse>>("/api/shop/slots?productType=Resell", Json);
        Assert.DoesNotContain(pub!, s => s.SlotId == slot.SlotId);

        var edit = await SetProductsAsync(admin, slot.SlotId, a.Id);
        Assert.Equal(HttpStatusCode.Conflict, edit.StatusCode);
    }

    [Fact]
    public async Task Draft_products_are_hidden_from_the_public_slot_api()
    {
        var admin = await AdminAsync();
        var tag = Guid.NewGuid().ToString("N")[..6];
        var live = await CreateProductAsync(admin, "Live " + tag, 1);
        var draft = await CreateProductAsync(admin, "Draft " + tag, 1, publish: false);
        var slot = await CreateSlotAsync(admin, "Mixed " + tag, 1);
        (await SetProductsAsync(admin, slot.SlotId, live.Id, draft.Id)).EnsureSuccessStatusCode();

        var pub = await _factory.CreateClient().GetFromJsonAsync<List<ShopSlotResponse>>("/api/shop/slots?productType=Resell", Json);
        var mine = pub!.Single(s => s.SlotId == slot.SlotId);
        Assert.Equal(new[] { live.Id }, mine.Products.Select(x => x.Id));

        // Admin still sees both.
        var adminView = await admin.GetFromJsonAsync<ShopSlotResponse>($"/api/admin/shop/slots/{slot.SlotId}", Json);
        Assert.Equal(2, adminView!.Products.Count);

        // Unpublishing the last published product hides the whole slot publicly (no empty rails).
        (await admin.PostAsync($"/api/products/{live.Id}/unpublish", null)).EnsureSuccessStatusCode();
        var pub2 = await _factory.CreateClient().GetFromJsonAsync<List<ShopSlotResponse>>("/api/shop/slots?productType=Resell", Json);
        Assert.DoesNotContain(pub2!, s => s.SlotId == slot.SlotId);
    }

    [Fact]
    public async Task Slot_admin_endpoints_require_authentication_and_product_delete_cleans_links()
    {
        var anon = _factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.GetAsync("/api/admin/shop/slots")).StatusCode);

        var admin = await AdminAsync();
        var tag = Guid.NewGuid().ToString("N")[..6];
        var a = await CreateProductAsync(admin, "Del " + tag, 1);
        var slot = await CreateSlotAsync(admin, "Del slot " + tag, 1);
        (await SetProductsAsync(admin, slot.SlotId, a.Id)).EnsureSuccessStatusCode();

        var del = await admin.DeleteAsync($"/api/products/{a.Id}");
        Assert.Equal(HttpStatusCode.NoContent, del.StatusCode);
        var after = await admin.GetFromJsonAsync<ShopSlotResponse>($"/api/admin/shop/slots/{slot.SlotId}", Json);
        Assert.Empty(after!.Products);

        var delSlot = await admin.DeleteAsync($"/api/admin/shop/slots/{slot.SlotId}");
        Assert.Equal(HttpStatusCode.NoContent, delSlot.StatusCode);
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
}
