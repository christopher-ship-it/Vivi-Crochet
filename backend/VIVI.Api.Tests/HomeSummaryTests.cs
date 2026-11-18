using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using VIVI.Api.DTOs.Products;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Infrastructure.Data;
using Xunit;

namespace VIVI.Api.Tests;

public sealed class HomeSummaryTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public HomeSummaryTests(ApiFactory factory)
    {
        _factory = factory;
        _ = factory.CreateClient();
    }

    private static Product NewProduct(string category, string name, bool published = true, Guid? courseId = null) => new()
    {
        Id = Guid.NewGuid(),
        Name = name,
        Category = category,
        Price = 100,
        Status = published ? ProductStatus.Published : ProductStatus.Draft,
        ImageUrl = $"products/{name}/image/full.png",
        CourseId = courseId,
        CreatedAt = DateTime.UtcNow,
        UpdatedAt = DateTime.UtcNow,
    };

    [Fact]
    public async Task Summary_has_eight_slides_one_category_in_turn_and_the_linked_course_ids()
    {
        var courseId = DatabaseSeeder.Catalog.FoundationId;
        var withThumb = NewProduct("Hs-A", "hs-a1");
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
            db.Products.Add(withThumb);
            db.ProductImages.Add(new ProductImage
            {
                Id = Guid.NewGuid(),
                ProductId = withThumb.Id,
                BlobPath = withThumb.ImageUrl!,
                ThumbBlobPath = "products/hs-a1/image/thumb/full.webp",
                IsMain = true,
                CreatedAt = DateTime.UtcNow,
            });
            foreach (var n in new[] { 2, 3, 4, 5 }) db.Products.Add(NewProduct("Hs-A", $"hs-a{n}"));
            foreach (var n in new[] { 1, 2, 3 }) db.Products.Add(NewProduct("Hs-B", $"hs-b{n}", courseId: n == 1 ? courseId : null));
            foreach (var n in new[] { 1, 2 }) db.Products.Add(NewProduct("Hs-C", $"hs-c{n}"));
            db.Products.Add(NewProduct("Hs-A", "hs-draft", published: false));
            await db.SaveChangesAsync();
        }

        var summary = (await _factory.CreateClient().GetFromJsonAsync<HomeSummaryResponse>(
            "/api/products/home-summary", AuthTests.Json))!;

        var mine = summary.ShopSlides.Where(s => s.Name.StartsWith("hs-")).Select(s => s.Name).ToList();
        Assert.True(summary.ShopSlides.Count <= 8);
        // Categories take turns: A, B, C, then A, B, C again.
        Assert.Equal(new[] { "hs-a1", "hs-b1", "hs-c1", "hs-a2", "hs-b2", "hs-c2", "hs-a3", "hs-b3" }.Take(mine.Count), mine);
        Assert.DoesNotContain(summary.ShopSlides, s => s.Name == "hs-draft");
        Assert.Contains("thumb", summary.ShopSlides.First(s => s.Name == "hs-a1").ImageUrl);
        Assert.Contains(courseId, summary.LinkedCourseIds);
    }
}
