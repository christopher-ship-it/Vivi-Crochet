using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Infrastructure.Auth;
using VIVI.Infrastructure.Data;
using Xunit;

namespace VIVI.Api.Tests;

public class TestAccountSeedTests
{
    private const string Phone = "9999999999";

    private static DbContextOptions<ViviDbContext> NewOptions() =>
        new DbContextOptionsBuilder<ViviDbContext>()
            .UseInMemoryDatabase($"test-account-{Guid.NewGuid()}")
            .Options;

    private static SeedSettings Settings() => new()
    {
        TestAccount = new TestAccountSettings
        {
            Enabled = true,
            Phone = Phone,
            Name = "VIVI Test Account",
            AccessDays = 3650,
            LoginSecret = new string('x', TestAccountSettings.MinimumSecretLength)
        }
    };

    private static async Task RunSeederAsync(DbContextOptions<ViviDbContext> options, SeedSettings settings)
    {
        await using var db = new ViviDbContext(options);
        var hasher = new PasswordHasher<AdminUser>();
        var seeder = new DatabaseSeeder(
            db,
            hasher,
            new CustomerAccountService(db, hasher),
            settings,
            NullLogger<DatabaseSeeder>.Instance);
        await seeder.SeedAsync();
    }

    private static async Task AddPublishedProductAsync(DbContextOptions<ViviDbContext> options, string name, int price)
    {
        await using var db = new ViviDbContext(options);
        db.Products.Add(new Product
        {
            Id = Guid.NewGuid(),
            Name = name,
            Category = "Amigurumi",
            Price = price,
            Status = ProductStatus.Published,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        });
        await db.SaveChangesAsync();
    }

    private static async Task AddPublishedCourseAsync(DbContextOptions<ViviDbContext> options, string name)
    {
        await using var db = new ViviDbContext(options);
        db.Courses.Add(new Course
        {
            Id = Guid.NewGuid(),
            Name = name,
            Type = CourseType.DigitalCourse,
            Price = 1499,
            AccessDays = 30,
            Status = CourseStatus.Published,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        });
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task Seeding_GrantsActiveEnrollmentInEveryPublishedCourse()
    {
        var options = NewOptions();
        await AddPublishedCourseAsync(options, "Amigurumi Basics");
        await AddPublishedCourseAsync(options, "Granny Squares");

        await RunSeederAsync(options, Settings());

        await using var db = new ViviDbContext(options);
        var customer = await db.Customers.SingleAsync(c => c.PhoneNumber == Phone);
        var enrollments = await db.CourseEnrollments
            .Where(e => e.CustomerId == customer.Id)
            .ToListAsync();

        Assert.Equal(2, enrollments.Count);
        Assert.All(enrollments, e =>
        {
            Assert.True(e.AccessStartDate <= DateTime.UtcNow);
            Assert.True(e.AccessExpiryDate > DateTime.UtcNow.AddYears(5));
        });
    }

    [Fact]
    public async Task Seeding_IsIdempotentAndPicksUpCoursesPublishedLater()
    {
        var options = NewOptions();
        await AddPublishedCourseAsync(options, "Amigurumi Basics");

        await RunSeederAsync(options, Settings());
        await RunSeederAsync(options, Settings());

        await using (var db = new ViviDbContext(options))
        {
            Assert.Single(await db.CourseEnrollments.ToListAsync());
            Assert.Single(await db.Orders
                .Where(o => o.OrderNumber == DatabaseSeeder.TestAccessOrderNumber(Phone))
                .ToListAsync());
        }

        await AddPublishedCourseAsync(options, "Granny Squares");
        await RunSeederAsync(options, Settings());

        await using (var db = new ViviDbContext(options))
        {
            Assert.Equal(2, await db.CourseEnrollments.CountAsync());
            var order = await db.Orders.SingleAsync(o => o.OrderNumber == DatabaseSeeder.TestAccessOrderNumber(Phone));
            Assert.Equal(0m, order.TotalAmount);
            Assert.Equal(2, await db.OrderItems.CountAsync(i => i.OrderId == order.Id));
        }
    }

    [Fact]
    public async Task Seeding_SkipsDraftCourses()
    {
        var options = NewOptions();
        await AddPublishedCourseAsync(options, "Amigurumi Basics");

        await using (var db = new ViviDbContext(options))
        {
            db.Courses.Add(new Course
            {
                Id = Guid.NewGuid(),
                Name = "Unfinished Draft",
                Price = 999,
                Status = CourseStatus.Draft,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
        }

        await RunSeederAsync(options, Settings());

        await using (var db = new ViviDbContext(options))
        {
            var enrollment = await db.CourseEnrollments.SingleAsync();
            var course = await db.Courses.SingleAsync(c => c.Id == enrollment.CourseId);
            Assert.Equal("Amigurumi Basics", course.Name);
        }
    }

    [Fact]
    public async Task Seeding_DoesNothingWhenDisabled()
    {
        var options = NewOptions();
        await AddPublishedCourseAsync(options, "Amigurumi Basics");

        var settings = Settings();
        settings.TestAccount.Enabled = false;
        await RunSeederAsync(options, settings);

        await using var db = new ViviDbContext(options);
        Assert.Empty(await db.CourseEnrollments.ToListAsync());
        Assert.Empty(await db.Customers.ToListAsync());
    }

    [Fact]
    public async Task Seeding_GrantsAConfirmedShopOrderForEveryPublishedProduct()
    {
        var options = NewOptions();
        await AddPublishedProductAsync(options, "Puffin Buddy", 899);
        await AddPublishedProductAsync(options, "Grey Elephant", 1150);

        await RunSeederAsync(options, Settings());

        await using var db = new ViviDbContext(options);
        var customer = await db.Customers.SingleAsync(c => c.PhoneNumber == Phone);
        var shop = await db.Orders.SingleAsync(o => o.OrderNumber == DatabaseSeeder.TestShopOrderNumber(Phone));

        Assert.Equal(customer.Id, shop.CustomerId);
        Assert.Equal(OrderStatus.Confirmed, shop.Status);
        Assert.Equal(2049m, shop.TotalAmount);
        Assert.Equal(2, await db.OrderItems.CountAsync(i => i.OrderId == shop.Id && i.ItemType == OrderItemType.Product));
    }

    [Fact]
    public async Task Seeding_IsIdempotentAndPicksUpProductsPublishedLater()
    {
        var options = NewOptions();
        await AddPublishedProductAsync(options, "Puffin Buddy", 899);
        await RunSeederAsync(options, Settings());
        await RunSeederAsync(options, Settings());

        await using (var db = new ViviDbContext(options))
        {
            Assert.Single(await db.Orders.Where(o => o.OrderNumber == DatabaseSeeder.TestShopOrderNumber(Phone)).ToListAsync());
            Assert.Single(await db.OrderItems.Where(i => i.ItemType == OrderItemType.Product).ToListAsync());
        }

        await AddPublishedProductAsync(options, "Grey Elephant", 1150);
        await RunSeederAsync(options, Settings());

        await using (var db = new ViviDbContext(options))
        {
            var shop = await db.Orders.SingleAsync(o => o.OrderNumber == DatabaseSeeder.TestShopOrderNumber(Phone));
            Assert.Equal(2049m, shop.TotalAmount);
            Assert.Equal(2, await db.OrderItems.CountAsync(i => i.OrderId == shop.Id && i.ItemType == OrderItemType.Product));
        }
    }

    [Fact]
    public async Task Seeding_SkipsDraftProducts()
    {
        var options = NewOptions();
        await AddPublishedProductAsync(options, "Puffin Buddy", 899);

        await using (var db = new ViviDbContext(options))
        {
            db.Products.Add(new Product
            {
                Id = Guid.NewGuid(),
                Name = "Unfinished Draft",
                Category = "Amigurumi",
                Price = 500,
                Status = ProductStatus.Draft,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
        }

        await RunSeederAsync(options, Settings());

        await using (var db = new ViviDbContext(options))
        {
            Assert.Single(await db.OrderItems.Where(i => i.ItemType == OrderItemType.Product).ToListAsync());
            var item = await db.OrderItems.SingleAsync(i => i.ItemType == OrderItemType.Product);
            Assert.Equal("Puffin Buddy", item.ItemNameSnapshot);
        }
    }

    [Fact]
    public async Task Seeding_ExtendsAnEnrollmentThatWouldOtherwiseLapse()
    {
        var options = NewOptions();
        await AddPublishedCourseAsync(options, "Amigurumi Basics");
        await RunSeederAsync(options, Settings());

        await using (var db = new ViviDbContext(options))
        {
            var enrollment = await db.CourseEnrollments.SingleAsync();
            enrollment.AccessExpiryDate = DateTime.UtcNow.AddDays(-1);
            await db.SaveChangesAsync();
        }

        await RunSeederAsync(options, Settings());

        await using (var db = new ViviDbContext(options))
        {
            var enrollment = await db.CourseEnrollments.SingleAsync();
            Assert.True(enrollment.AccessExpiryDate > DateTime.UtcNow.AddYears(5));
        }
    }

    [Fact]
    public async Task ChangingThePhone_GivesTheNewCustomerItsOwnOrderAndEnrollments()
    {
        const string secondPhone = "9888877777";
        var options = NewOptions();
        await AddPublishedCourseAsync(options, "Amigurumi Basics");
        await RunSeederAsync(options, Settings());

        var moved = Settings();
        moved.TestAccount.Phone = secondPhone;
        await RunSeederAsync(options, moved);

        await using var db = new ViviDbContext(options);
        var second = await db.Customers.SingleAsync(c => c.PhoneNumber == secondPhone);
        var order = await db.Orders.SingleAsync(o =>
            o.CustomerId == second.Id && o.OrderNumber == DatabaseSeeder.TestAccessOrderNumber(secondPhone));

        Assert.Equal(2, await db.Orders.CountAsync(o => o.OrderNumber.StartsWith("VIVI-TEST-") && !o.OrderNumber.Contains("SHOP")));
        Assert.Single(await db.CourseEnrollments.Where(e => e.CustomerId == second.Id).ToListAsync());
    }

    [Fact]
    public void SecretShorterThanTheMinimumIsRejected()
    {
        var settings = new TestAccountSettings { LoginSecret = "short" };
        Assert.False(settings.HasUsableSecret);

        settings.LoginSecret = new string('a', TestAccountSettings.MinimumSecretLength);
        Assert.True(settings.HasUsableSecret);
    }
}
