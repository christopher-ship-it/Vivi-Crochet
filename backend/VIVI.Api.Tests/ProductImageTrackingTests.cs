using Microsoft.EntityFrameworkCore;
using VIVI.Core.Entities;
using VIVI.Infrastructure.Data;
using Xunit;

namespace VIVI.Api.Tests;

public class ProductImageTrackingTests
{
    private static DbContextOptions<ViviDbContext> NewOptions() =>
        new DbContextOptionsBuilder<ViviDbContext>()
            .UseInMemoryDatabase($"tracking-{Guid.NewGuid()}")
            .Options;

    private static async Task<Guid> SeedProductAsync(DbContextOptions<ViviDbContext> options)
    {
        var productId = Guid.NewGuid();
        await using var db = new ViviDbContext(options);
        db.Products.Add(new Product
        {
            Id = productId,
            Name = "Puffin Buddy",
            Category = "Amigurumi",
            Price = 899,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        });
        await db.SaveChangesAsync();
        return productId;
    }

    private static ProductImage NewImage(Guid productId) => new()
    {
        Id = Guid.NewGuid(),
        ProductId = productId,
        BlobPath = $"products/{productId:D}/image/abc-photo.jpeg",
        SortOrder = 0,
        IsMain = true,
        CreatedAt = DateTime.UtcNow
    };

    [Fact]
    public async Task AddingImageThroughTheSet_TracksItAsAdded()
    {
        var options = NewOptions();
        var productId = await SeedProductAsync(options);

        await using var db = new ViviDbContext(options);
        var product = await db.Products
            .Include(p => p.Images)
            .SingleAsync(p => p.Id == productId);

        var image = NewImage(productId);
        product.Images.Add(image);
        db.ProductImages.Add(image);
        db.ChangeTracker.DetectChanges();

        Assert.Equal(EntityState.Added, db.Entry(image).State);
        Assert.Single(product.Images);
    }

    [Fact]
    public async Task AddingImageThroughTheSet_PersistsExactlyOneRow()
    {
        var options = NewOptions();
        var productId = await SeedProductAsync(options);

        await using (var db = new ViviDbContext(options))
        {
            var product = await db.Products
                .Include(p => p.Images)
                .SingleAsync(p => p.Id == productId);

            var image = NewImage(productId);
            product.Images.Add(image);
            db.ProductImages.Add(image);
            product.ImageUrl = image.BlobPath;
            product.UpdatedAt = DateTime.UtcNow;

            await db.SaveChangesAsync();
        }

        await using (var db = new ViviDbContext(options))
        {
            var saved = await db.ProductImages
                .Where(i => i.ProductId == productId)
                .ToListAsync();

            var single = Assert.Single(saved);
            Assert.True(single.IsMain);
            Assert.Equal(0, single.SortOrder);
        }
    }
}
