using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using VIVI.Core.Entities;
using VIVI.Infrastructure.Auth;
using VIVI.Infrastructure.Commerce;
using VIVI.Infrastructure.Data;
using Xunit;

namespace VIVI.Api.Tests;

/// <summary>The seeder runs on every API start, so it must never undo what an admin saved.</summary>
public sealed class SeederKeepsAdminEditsTests
{
    private static async Task SeedAsync(DbContextOptions<ViviDbContext> options)
    {
        await using var db = new ViviDbContext(options);
        var hasher = new PasswordHasher<AdminUser>();
        var cleanup = new AdminDataCleanupService(db, new InventoryService(db));
        var seeder = new DatabaseSeeder(
            db,
            hasher,
            new CustomerAccountService(db, hasher, cleanup),
            new SeedSettings { AdminPassword = "Seed-Admin-Password-1" },
            NullLogger<DatabaseSeeder>.Instance);
        await seeder.SeedAsync();
    }

    [Fact]
    public async Task Restarting_keeps_renamed_courses_categories_and_bundle_contents()
    {
        var options = new DbContextOptionsBuilder<ViviDbContext>()
            .UseInMemoryDatabase($"seeder-edits-{Guid.NewGuid()}")
            .Options;
        await SeedAsync(options);

        Guid otherCategoryId;
        await using (var db = new ViviDbContext(options))
        {
            var foundation = await db.Courses.SingleAsync(c => c.Id == DatabaseSeeder.Catalog.FoundationId);
            foundation.Name = "Crochet Basics";
            foundation.Level = "Beginner";

            var viral = await db.Categories.SingleAsync(c => c.Id == DatabaseSeeder.Catalog.ViralProjectsCategoryId);
            viral.Name = "Weekend projects";
            viral.SortOrder = 9;
            viral.IsActive = false;

            // Move a course to another category, and take one course out of the bundle.
            otherCategoryId = viral.Id;
            (await db.Courses.SingleAsync(c => c.Id == DatabaseSeeder.Catalog.SignatureId)).CategoryId = otherCategoryId;
            db.CourseBundleItems.RemoveRange(
                db.CourseBundleItems.Where(b => b.IncludedCourseId == DatabaseSeeder.Catalog.MasterId));
            await db.SaveChangesAsync();
        }

        await SeedAsync(options); // an API restart

        await using var after = new ViviDbContext(options);
        var course = await after.Courses.SingleAsync(c => c.Id == DatabaseSeeder.Catalog.FoundationId);
        Assert.Equal("Crochet Basics", course.Name);
        Assert.Equal("Beginner", course.Level);

        var category = await after.Categories.SingleAsync(c => c.Id == DatabaseSeeder.Catalog.ViralProjectsCategoryId);
        Assert.Equal("Weekend projects", category.Name);
        Assert.Equal(9, category.SortOrder);
        Assert.False(category.IsActive);

        Assert.Equal(otherCategoryId, (await after.Courses.SingleAsync(c => c.Id == DatabaseSeeder.Catalog.SignatureId)).CategoryId);
        Assert.DoesNotContain(
            await after.CourseBundleItems.ToListAsync(),
            b => b.IncludedCourseId == DatabaseSeeder.Catalog.MasterId);
    }
}
