using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using VIVI.Api.DTOs.Products;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Infrastructure.Commerce;
using VIVI.Infrastructure.Data;
using Xunit;

namespace VIVI.Api.Tests;

/// <summary>Bulk product upload from a spreadsheet (yarn shades and other products).</summary>
public sealed class ProductImportTests
{
    private const string Url = "/api/admin/products/import";

    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter() }
    };

    private sealed record Sheet(int RowNumber, Dictionary<string, string?> Cells);

    /// <summary>A row using the column names of the sheet the shop owner already has.</summary>
    private static Sheet YarnRow(int row, string code, string shade, string price = "130", string? stock = null)
    {
        var cells = new Dictionary<string, string?>
        {
            ["Product"] = "Desire Knitting Yarn",
            ["Shade Code"] = code,
            ["Shade Name"] = shade,
            ["Display Name"] = $"{shade} – {code}",
            ["Price (INR)"] = price,
            ["Ball Weight"] = "100 g",
            ["Yarn Length"] = "200 m",
            ["Fibre / Blend"] = "100% Acrylic",
            ["Yarn Weight"] = "4 Medium",
            ["Needle Size"] = "UK 5 (5.5 mm)",
            ["Crochet Hook Size"] = "UK 3 (6.5 mm)",
            ["Image Filename"] = $"{code}_{shade}.jpg",
            ["Source URL"] = "https://example.com/yarn"
        };
        if (stock is not null)
            cells["Stock"] = stock;
        return new Sheet(row, cells);
    }

    private static object Request(IEnumerable<Sheet> rows, bool dryRun = false, string? defaultCategory = "Yarn") => new
    {
        defaultCategory,
        dryRun,
        rows = rows.Select(r => new { rowNumber = r.RowNumber, cells = r.Cells })
    };

    private static async Task<HttpClient> AdminAsync(ApiFactory factory)
    {
        var admin = factory.CreateClient();
        AuthTests.WithToken(admin, await AuthTests.LoginAsync(admin));
        return admin;
    }

    private static async Task<ProductImportResult> PostAsync(HttpClient admin, object request)
    {
        var response = await admin.PostAsJsonAsync(Url, request, Json);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ProductImportResult>(Json))!;
    }

    private static async Task<ProductResponse?> ListingAsync(HttpClient admin, string name)
    {
        var all = await admin.GetFromJsonAsync<List<ProductResponse>>("/api/products?productType=Resell", Json);
        return all!.SingleOrDefault(p => p.Name == name);
    }

    [Fact]
    public async Task Columns_endpoint_lists_the_names_used_in_the_admin_form()
    {
        await using var factory = new ApiFactory();
        var admin = await AdminAsync(factory);

        var columns = await admin.GetFromJsonAsync<List<ProductImportColumn>>($"{Url}/columns", Json);

        var headers = columns!.Select(c => c.Header).ToList();
        foreach (var expected in new[]
                 {
                     "Product name", "Product code", "Category", "Price", "MRP", "Stock", "Description",
                     "Spec 1", "Spec 2", "Ball weight", "Yarn length", "Crochet hook size",
                     "Fibre / blend", "Yarn weight", "Needle size", "Shade / colour name", "Swatch colour"
                 })
            Assert.Contains(expected, headers);
        Assert.Equal(new[] { "Product name", "Product code", "Price" }, columns.Where(c => c.Required).Select(c => c.Header));
    }

    [Fact]
    public async Task The_existing_yarn_sheet_layout_creates_one_listing_with_a_shade_per_row()
    {
        await using var factory = new ApiFactory();
        var admin = await AdminAsync(factory);

        var result = await PostAsync(admin, Request([
            YarnRow(2, "DSR001", "Lilac"),
            YarnRow(3, "DSR002", "Beige"),
            YarnRow(4, "DSR003", "Jet Black", price: "₹150")
        ]));

        Assert.True(result.Applied, string.Join("; ", result.Errors.Select(e => $"{e.Row}: {e.Message}")));
        Assert.Equal(1, result.Summary.ListingsCreated);
        Assert.Equal(3, result.Summary.ShadesCreated);
        Assert.Equal(new[] { "DSR001", "DSR002", "DSR003" }, result.ProductCodes);
        // Columns that are not imported are reported, not silently lost.
        Assert.Contains("Display Name", result.IgnoredColumns);
        Assert.Contains("Source URL", result.IgnoredColumns);

        var listing = await ListingAsync(admin, "Desire Knitting Yarn");
        Assert.NotNull(listing);
        Assert.Equal("Yarn", listing!.Category);
        Assert.Equal(ProductType.Resell, listing.ProductType);
        Assert.Equal(ProductStatus.Draft, listing.Status);
        Assert.Equal("100 g", listing.BallWeight);
        Assert.Equal("200 m", listing.YarnLength);
        Assert.Equal("UK 3 (6.5 mm)", listing.CrochetHookSize);
        Assert.Equal("100% Acrylic", listing.FibreBlend);
        Assert.Equal("4 Medium", listing.YarnWeight);
        Assert.Equal("UK 5 (5.5 mm)", listing.NeedleSize);
        Assert.Equal("Colour", listing.VariantOptionName);

        Assert.Equal(3, listing.Variants.Count);
        Assert.Equal(new[] { "Lilac", "Beige", "Jet Black" }, listing.Variants.OrderBy(v => v.SortOrder).Select(v => v.ColourName));
        Assert.Equal(new[] { 130, 130, 150 }, listing.Variants.OrderBy(v => v.SortOrder).Select(v => v.Price));
        Assert.All(listing.Variants, v => Assert.Equal(ProductStatus.Draft, v.Status));
    }

    [Fact]
    public async Task Dry_run_reports_what_would_happen_and_saves_nothing()
    {
        await using var factory = new ApiFactory();
        var admin = await AdminAsync(factory);

        var preview = await PostAsync(admin, Request([YarnRow(2, "DSR001", "Lilac"), YarnRow(3, "DSR002", "Beige")], dryRun: true));

        Assert.False(preview.Applied);
        Assert.Empty(preview.Errors);
        Assert.Equal(2, preview.Summary.ShadesCreated);
        Assert.All(preview.Rows, r => Assert.Equal("Create", r.Action));
        Assert.Null(await ListingAsync(admin, "Desire Knitting Yarn"));
    }

    [Fact]
    public async Task Uploading_again_updates_by_product_code_without_duplicating_or_erasing()
    {
        await using var factory = new ApiFactory();
        var admin = await AdminAsync(factory);
        await PostAsync(admin, Request([YarnRow(2, "DSR001", "Lilac", stock: "40"), YarnRow(3, "DSR002", "Beige", stock: "25")]));

        // Second upload: new price for DSR001, one new shade, no stock column, a blank spec.
        var again = YarnRow(2, "DSR001", "Lilac", price: "140");
        again.Cells["Fibre / Blend"] = "";
        var result = await PostAsync(admin, Request([again, YarnRow(3, "DSR002", "Beige"), YarnRow(4, "DSR003", "Cream")]));

        Assert.True(result.Applied);
        Assert.Equal(1, result.Summary.ListingsUpdated);
        Assert.Equal(0, result.Summary.ListingsCreated);
        Assert.Equal(2, result.Summary.ShadesUpdated);
        Assert.Equal(1, result.Summary.ShadesCreated);

        var listing = (await ListingAsync(admin, "Desire Knitting Yarn"))!;
        Assert.Equal(3, listing.Variants.Count);
        var lilac = listing.Variants.Single(v => v.ColourName == "Lilac");
        Assert.Equal(140, lilac.Price);
        Assert.Equal(40, lilac.AvailableStock); // the second sheet had no Stock column: unchanged
        Assert.Equal("100% Acrylic", listing.FibreBlend); // an empty cell never erases existing data
        Assert.Equal(0, listing.Variants.Single(v => v.ColourName == "Cream").AvailableStock);
    }

    [Fact]
    public async Task Any_error_means_nothing_is_saved_and_every_error_names_its_row()
    {
        await using var factory = new ApiFactory();
        var admin = await AdminAsync(factory);

        var bad = new[]
        {
            YarnRow(2, "DSR001", "Lilac"),
            YarnRow(3, "DSR001", "Beige"),                       // duplicate code
            YarnRow(4, "DSR003", "Cream", price: "abc"),        // not a number
            YarnRow(5, "DSR004", "Aqua", price: "130.50"),      // fractional rupees
            YarnRow(6, "", "Red"),                               // no code
        };
        bad[4].Cells["Swatch colour"] = "purple";               // not a hex colour

        var result = await PostAsync(admin, Request(bad));

        Assert.False(result.Applied);
        Assert.Equal(0, result.Summary.ShadesCreated);
        Assert.Empty(result.ProductCodes);
        Assert.Contains(result.Errors, e => e.Row == 3 && e.Message.Contains("DSR001"));
        Assert.Contains(result.Errors, e => e.Row == 4 && e.Message.Contains("not a number"));
        Assert.Contains(result.Errors, e => e.Row == 5 && e.Message.Contains("whole number"));
        Assert.Contains(result.Errors, e => e.Row == 6 && e.Message.Contains("Product code is required"));
        Assert.Contains(result.Errors, e => e.Row == 6 && e.Message.Contains("hex"));
        Assert.Null(await ListingAsync(admin, "Desire Knitting Yarn"));
    }

    [Fact]
    public async Task A_row_without_a_shade_is_a_single_product()
    {
        await using var factory = new ApiFactory();
        var admin = await AdminAsync(factory);

        var result = await PostAsync(admin, Request([
            new Sheet(2, new Dictionary<string, string?>
            {
                ["Product name"] = "Bamboo Hook Set",
                ["Category"] = "Tools",
                ["Product code"] = "HOOK-01",
                ["Price"] = "499",
                ["MRP"] = "599",
                ["Stock"] = "12",
                ["Description"] = "Set of 5 bamboo hooks."
            })
        ], defaultCategory: null));

        Assert.True(result.Applied, string.Join("; ", result.Errors.Select(e => e.Message)));
        Assert.Equal(1, result.Summary.SingleProductsCreated);

        var product = (await ListingAsync(admin, "Bamboo Hook Set"))!;
        Assert.Equal(0, product.VariantCount);
        Assert.Equal("HOOK-01", product.ProductCode);
        Assert.Equal(499, product.Price);
        Assert.Equal(599, product.Mrp);
        Assert.Equal(12, product.AvailableStock);
        Assert.Equal("Tools", product.Category);
        Assert.Equal(ProductType.Resell, product.ProductType); // Crochet Essentials is the default type
    }

    [Fact]
    public async Task The_default_category_fills_gaps_but_never_overwrites_an_existing_category()
    {
        await using var factory = new ApiFactory();
        var admin = await AdminAsync(factory);
        await PostAsync(admin, Request([YarnRow(2, "DSR001", "Lilac")], defaultCategory: "Knitting Yarn"));
        Assert.Equal("Knitting Yarn", (await ListingAsync(admin, "Desire Knitting Yarn"))!.Category);

        await PostAsync(admin, Request([YarnRow(2, "DSR001", "Lilac", price: "135")], defaultCategory: "Yarn"));

        Assert.Equal("Knitting Yarn", (await ListingAsync(admin, "Desire Knitting Yarn"))!.Category);
    }

    [Fact]
    public async Task A_code_that_belongs_to_another_product_is_rejected()
    {
        await using var factory = new ApiFactory();
        var admin = await AdminAsync(factory);
        await PostAsync(admin, Request([YarnRow(2, "DSR001", "Lilac")]));

        var other = YarnRow(2, "DSR001", "Lilac");
        other.Cells["Product"] = "Another Yarn";
        var result = await PostAsync(admin, Request([other]));

        Assert.False(result.Applied);
        Assert.Contains(result.Errors, e => e.Message.Contains("already belongs to"));
        Assert.Null(await ListingAsync(admin, "Another Yarn"));
    }

    [Fact]
    public async Task Shades_are_not_allowed_for_handmade_products()
    {
        await using var factory = new ApiFactory();
        var admin = await AdminAsync(factory);
        var row = YarnRow(2, "HM001", "Rose");
        row.Cells["Product type"] = "Handmade collection";

        var result = await PostAsync(admin, Request([row]));

        Assert.False(result.Applied);
        Assert.Contains(result.Errors, e => e.Message.Contains("only available for Crochet Essentials"));
    }

    [Fact]
    public async Task Publish_only_publishes_products_that_have_a_photo_and_their_listing()
    {
        await using var factory = new ApiFactory();
        var admin = await AdminAsync(factory);
        await PostAsync(admin, Request([YarnRow(2, "DSR001", "Lilac"), YarnRow(3, "DSR002", "Beige")]));

        // Give only DSR001 a photo.
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
            var lilac = await db.Products.SingleAsync(p => p.ProductCode == "DSR001");
            db.ProductImages.Add(new ProductImage
            {
                Id = Guid.NewGuid(),
                ProductId = lilac.Id,
                BlobPath = "products/test/dsr001.jpg",
                IsMain = true,
                SortOrder = 0,
                CreatedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
        }

        var response = await admin.PostAsJsonAsync($"{Url}/publish", new { productCodes = new[] { "dsr001", "DSR002", "NOPE" } }, Json);
        var published = (await response.Content.ReadFromJsonAsync<ProductPublishResult>(Json))!;

        Assert.Equal(1, published.Published);
        Assert.Equal(1, published.ListingsPublished);
        Assert.Equal(new[] { "DSR002" }, published.SkippedNoPhoto);
        Assert.Equal(new[] { "NOPE" }, published.NotFound);

        var listing = (await ListingAsync(admin, "Desire Knitting Yarn"))!;
        Assert.Equal(ProductStatus.Published, listing.Status);
        Assert.Equal(ProductStatus.Published, listing.Variants.Single(v => v.ColourName == "Lilac").Status);
        Assert.Equal(ProductStatus.Draft, listing.Variants.Single(v => v.ColourName == "Beige").Status);
    }

    [Fact]
    public async Task Customers_cannot_import()
    {
        await using var factory = new ApiFactory();
        var customer = await AuthTests.LoginCustomerAsync(factory.CreateClient(), "7600000011");

        var response = await customer.PostAsJsonAsync(Url, Request([YarnRow(2, "DSR001", "Lilac")]), Json);

        Assert.True(response.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.Unauthorized);
    }
}
