using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Infrastructure.Auth;

namespace VIVI.Infrastructure.Data;

public sealed class SeedSettings
{
    public string AdminEmail { get; set; } = "admin@vivicrochet.local";
    public string AdminPassword { get; set; } = string.Empty;
    public string AdminName { get; set; } = "Vivi Priya";
    public TestAccountSettings TestAccount { get; set; } = new();
}

/// <summary>
/// A complimentary customer used for testing the shop and course playback without paying.
/// Access is granted through a zero-value order so nothing downstream needs to special-case it.
/// </summary>
public sealed class TestAccountSettings
{
    /// <summary>Shortest secret accepted for <see cref="LoginSecret"/>.</summary>
    public const int MinimumSecretLength = 16;

    public bool Enabled { get; set; }
    public string Phone { get; set; } = string.Empty;
    public string Name { get; set; } = "VIVI Test Account";
    public int AccessDays { get; set; } = 3650;

    /// <summary>Shared secret for the passwordless test sign-in. Empty disables that endpoint.</summary>
    public string LoginSecret { get; set; } = string.Empty;

    public bool HasUsableSecret =>
        !string.IsNullOrWhiteSpace(LoginSecret) && LoginSecret.Trim().Length >= MinimumSecretLength;
}

public sealed class DatabaseSeeder
{
    /// <summary>
    /// Order number for the complimentary order that backs test-account enrollments.
    /// Scoped by phone so changing Seed:TestAccount:Phone starts a fresh order for the
    /// new customer instead of colliding with the unique order-number index.
    /// </summary>
    public static string TestAccessOrderNumber(string phone) => $"VIVI-TEST-{phone}";

    /// <summary>Order number for the complimentary shop order that fills My orders.</summary>
    public static string TestShopOrderNumber(string phone) => $"VIVI-TEST-SHOP-{phone}";

    private readonly ViviDbContext _db;
    private readonly IPasswordHasher<AdminUser> _passwordHasher;
    private readonly CustomerAccountService _customers;
    private readonly SeedSettings _settings;
    private readonly ILogger<DatabaseSeeder> _logger;

    public DatabaseSeeder(
        ViviDbContext db,
        IPasswordHasher<AdminUser> passwordHasher,
        CustomerAccountService customers,
        SeedSettings settings,
        ILogger<DatabaseSeeder> logger)
    {
        _db = db;
        _passwordHasher = passwordHasher;
        _customers = customers;
        _settings = settings;
        _logger = logger;
    }

    public async Task SeedAsync(CancellationToken cancellationToken = default)
    {
        await SeedAdminAsync(cancellationToken);
        await SeedCategoriesAsync(cancellationToken);
        try
        {
            await SeedCatalogCoursesAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Catalog course seed failed (Complete Collection bundle may be missing).");
            throw;
        }
        await SeedProductsAsync(cancellationToken);
        await ClearBlanketProductCourseLinksAsync(cancellationToken);
        await SeedTestAccountAsync(cancellationToken);
    }

    private async Task SeedAdminAsync(CancellationToken cancellationToken)
    {
        // Only create the first admin. Never overwrite existing logins on startup —
        // that would reset passwords whenever AutoSeed runs in production.
        if (await _db.AdminUsers.AnyAsync(u => u.Role == UserRole.Admin, cancellationToken))
            return;

        if (string.IsNullOrWhiteSpace(_settings.AdminPassword))
        {
            _logger.LogWarning(
                "No admin users exist and Seed:AdminPassword is empty. Set the environment variable to seed the first admin.");
            return;
        }

        var email = _settings.AdminEmail.Trim().ToLowerInvariant();
        var name = string.IsNullOrWhiteSpace(_settings.AdminName) ? "Admin" : _settings.AdminName.Trim();
        var now = DateTime.UtcNow;
        var admin = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = email,
            Name = name,
            Role = UserRole.Admin,
            IsActive = true,
            CreatedAt = now,
            UpdatedAt = now
        };
        admin.PasswordHash = _passwordHasher.HashPassword(admin, _settings.AdminPassword);

        _db.AdminUsers.Add(admin);
        await _db.SaveChangesAsync(cancellationToken);
        _logger.LogInformation("Seeded admin account {Email}", admin.Email);
    }

    private async Task SeedCategoriesAsync(CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        await EnsureCategoryAsync(
            Guid.Parse("11111111-1111-1111-1111-111111111111"),
            "Learn & Loop",
            "Levelled crochet classes",
            sortOrder: 1,
            now,
            cancellationToken);
        await EnsureCategoryAsync(
            Guid.Parse("22222222-2222-2222-2222-222222222222"),
            "Viral projects",
            "Stand-alone project classes",
            sortOrder: 2,
            now,
            cancellationToken);
        await EnsureCategoryAsync(
            Guid.Parse("33333333-3333-3333-3333-333333333333"),
            "Trending Tutorials",
            "Featured tutorials for the Home hero",
            sortOrder: 3,
            now,
            cancellationToken);
    }

    private async Task EnsureCategoryAsync(
        Guid id,
        string name,
        string description,
        int sortOrder,
        DateTime now,
        CancellationToken cancellationToken)
    {
        // Prefer stable id, then exact name, then a close “trending*” / “viral*” typo match.
        var existing = await _db.Categories.FirstOrDefaultAsync(c => c.Id == id, cancellationToken)
            ?? await _db.Categories.FirstOrDefaultAsync(
                c => c.Name.ToLower() == name.ToLower(),
                cancellationToken);

        if (existing is null && name.StartsWith("Trending", StringComparison.OrdinalIgnoreCase))
        {
            existing = await _db.Categories.FirstOrDefaultAsync(
                c => c.Name.ToLower().StartsWith("trending"),
                cancellationToken);
        }
        else if (existing is null && name.StartsWith("Viral", StringComparison.OrdinalIgnoreCase))
        {
            existing = await _db.Categories.FirstOrDefaultAsync(
                c => c.Name.ToLower().StartsWith("viral"),
                cancellationToken);
        }

        if (existing is null)
        {
            _db.Categories.Add(new Category
            {
                Id = id,
                Name = name,
                Description = description,
                SortOrder = sortOrder,
                IsActive = true,
                CreatedAt = now,
                UpdatedAt = now
            });
            await _db.SaveChangesAsync(cancellationToken);
            _logger.LogInformation("Seeded category {Name}", name);
            return;
        }

        var changed = false;
        if (!string.Equals(existing.Name, name, StringComparison.Ordinal))
        {
            existing.Name = name;
            changed = true;
        }
        if (!existing.IsActive)
        {
            existing.IsActive = true;
            changed = true;
        }
        if (existing.SortOrder != sortOrder)
        {
            existing.SortOrder = sortOrder;
            changed = true;
        }
        if (changed)
        {
            existing.UpdatedAt = now;
            await _db.SaveChangesAsync(cancellationToken);
            _logger.LogInformation("Updated category {Name}", name);
        }
    }

    /// <summary>
    /// Stable catalog ids so seed is idempotent and tests can address courses by id.
    /// Existing non-catalog courses (including any test course) are left untouched.
    /// </summary>
    public static class Catalog
    {
        public static readonly Guid LearnLoopCategoryId = Guid.Parse("11111111-1111-1111-1111-111111111111");
        public static readonly Guid ViralProjectsCategoryId = Guid.Parse("22222222-2222-2222-2222-222222222222");
        public static readonly Guid TrendingTutorialsCategoryId = Guid.Parse("33333333-3333-3333-3333-333333333333");
        public static readonly Guid FoundationId = Guid.Parse("c0a1f001-0001-4000-8000-000000000001");
        public static readonly Guid SignatureId = Guid.Parse("c0a1f001-0001-4000-8000-000000000002");
        public static readonly Guid MasterId = Guid.Parse("c0a1f001-0001-4000-8000-000000000003");
        public static readonly Guid BundleId = Guid.Parse("c0a1f001-0001-4000-8000-000000000004");
    }

    private async Task SeedCatalogCoursesAsync(CancellationToken cancellationToken)
    {
        var adminId = await _db.AdminUsers
            .AsNoTracking()
            .Where(u => u.Role == UserRole.Admin)
            .Select(u => u.Id)
            .FirstOrDefaultAsync(cancellationToken);
        if (adminId == Guid.Empty)
        {
            _logger.LogWarning("No admin user exists; skipping catalog course seed.");
            return;
        }

        var categoryId = await _db.Categories
            .AsNoTracking()
            .Where(c => c.Id == Catalog.LearnLoopCategoryId)
            .Select(c => (Guid?)c.Id)
            .FirstOrDefaultAsync(cancellationToken);

        var now = DateTime.UtcNow;

        await UpsertCatalogCourseAsync(
            Catalog.FoundationId,
            "Foundation Stitches",
            "7 guided lessons + 5 mini cute projects.",
            "Beginner",
            299,
            null,
            30,
            CourseType.DigitalCourse,
            categoryId,
            adminId,
            now,
            cancellationToken);

        await UpsertCatalogCourseAsync(
            Catalog.SignatureId,
            "Signature Stitches",
            "10 guided lessons + 5 mini cute projects.",
            "Intermediate",
            599,
            null,
            45,
            CourseType.DigitalCourse,
            categoryId,
            adminId,
            now,
            cancellationToken);

        await UpsertCatalogCourseAsync(
            Catalog.MasterId,
            "Master Stitch Series",
            "10 guided lessons + 10 mini cute projects.",
            "Advanced",
            1099,
            null,
            60,
            CourseType.DigitalCourse,
            categoryId,
            adminId,
            now,
            cancellationToken);

        await UpsertCatalogCourseAsync(
            Catalog.BundleId,
            "The Complete Crochet Collection / All-Access Crochet Pass",
            "All 27 recorded lessons. FIRST 100 USERS · LAUNCH OFFER · ₹999 · SAVE ₹998",
            "All levels",
            1699,
            1997,
            30,
            CourseType.Bundle,
            categoryId,
            adminId,
            now,
            cancellationToken);

        // Persist courses before bundle membership / launch-offer FKs.
        await _db.SaveChangesAsync(cancellationToken);

        await SyncBundleMembershipAsync(cancellationToken);
        await SyncBundleLaunchOfferAsync(now, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
        _logger.LogInformation("Catalog courses upserted (Foundation, Signature, Master, Complete Collection).");
    }

    private async Task UpsertCatalogCourseAsync(
        Guid id,
        string name,
        string about,
        string level,
        int price,
        int? mrp,
        int accessDays,
        CourseType type,
        Guid? categoryId,
        Guid adminId,
        DateTime now,
        CancellationToken cancellationToken)
    {
        var existing = await _db.Courses.SingleOrDefaultAsync(c => c.Id == id, cancellationToken);
        if (existing is null)
        {
            _db.Courses.Add(new Course
            {
                Id = id,
                Name = name,
                About = about,
                Level = level,
                Price = price,
                Mrp = mrp,
                AccessDays = accessDays,
                Type = type,
                CategoryId = categoryId,
                Status = CourseStatus.Published,
                RenewalPercentage = 50,
                CreatedAt = now,
                UpdatedAt = now,
                CreatedBy = adminId
            });
            return;
        }

        existing.Name = name;
        existing.About = about;
        existing.Level = level;
        existing.Price = price;
        existing.Mrp = mrp;
        existing.AccessDays = accessDays;
        existing.Type = type;
        if (categoryId.HasValue)
            existing.CategoryId = categoryId;
        existing.UpdatedAt = now;
    }

    private async Task SyncBundleMembershipAsync(CancellationToken cancellationToken)
    {
        var included = new[] { Catalog.FoundationId, Catalog.SignatureId, Catalog.MasterId };
        var existing = await _db.CourseBundleItems
            .Where(b => b.BundleCourseId == Catalog.BundleId)
            .ToListAsync(cancellationToken);

        var existingIds = existing.Select(b => b.IncludedCourseId).ToHashSet();
        if (existingIds.SetEquals(included) && existing.Count == included.Length)
            return;

        _db.CourseBundleItems.RemoveRange(existing);
        var sort = 0;
        var now = DateTime.UtcNow;
        foreach (var courseId in included)
        {
            _db.CourseBundleItems.Add(new CourseBundleItem
            {
                Id = Guid.NewGuid(),
                BundleCourseId = Catalog.BundleId,
                IncludedCourseId = courseId,
                SortOrder = sort++,
                CreatedAt = now
            });
        }
    }

    private async Task SyncBundleLaunchOfferAsync(DateTime now, CancellationToken cancellationToken)
    {
        var offer = await _db.LaunchOfferCounters
            .SingleOrDefaultAsync(c => c.CourseId == Catalog.BundleId, cancellationToken);
        if (offer is null)
        {
            _db.LaunchOfferCounters.Add(new LaunchOfferCounter
            {
                Id = Guid.NewGuid(),
                CourseId = Catalog.BundleId,
                LaunchLimit = 100,
                LaunchPrice = 999,
                RegularPriceAfterLaunch = 1699,
                Mrp = 1997,
                CompletedPurchaseCount = 0,
                CreatedAt = now,
                UpdatedAt = now
            });
            return;
        }

        offer.LaunchLimit = 100;
        offer.LaunchPrice = 999;
        offer.RegularPriceAfterLaunch = 1699;
        offer.Mrp = 1997;
        offer.UpdatedAt = now;
    }

    private async Task SeedProductsAsync(CancellationToken cancellationToken)
    {
        if (await _db.Products.AnyAsync(cancellationToken))
            return;

        var linkedCourse = await _db.Courses
            .AsNoTracking()
            .Where(c => c.Status == CourseStatus.Published)
            .OrderBy(c => c.CreatedAt)
            .Select(c => new { c.Id })
            .FirstOrDefaultAsync(cancellationToken);

        var now = DateTime.UtcNow;
        // Only seed an intentional course link on one demo product. Do not attach
        // every product to a course — that makes every shop card show "Learn".
        var demoCourseId = linkedCourse?.Id;
        var products = new[]
        {
            new Product
            {
                Id = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1"),
                Name = "Puffin Buddy",
                Category = "Amigurumi",
                Description = "A palm-sized puffin worked in the round in soft cotton, with a hand-embroidered beak and safety eyes.",
                Price = 899,
                Mrp = 1050,
                Spec1 = "18 cm tall",
                Spec2 = "Cotton yarn",
                CourseId = demoCourseId,
                SortOrder = 1,
                Status = ProductStatus.Published,
                CreatedAt = now,
                UpdatedAt = now
            },
            new Product
            {
                Id = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2"),
                Name = "Grey Elephant",
                Category = "Amigurumi",
                Description = "Big ears, pink inners, jointed legs. Worked in tight single crochet so it holds its shape for years.",
                Price = 1150,
                Mrp = 1350,
                Spec1 = "26 cm tall",
                Spec2 = "Baby-safe fill",
                CourseId = null,
                SortOrder = 2,
                Status = ProductStatus.Published,
                CreatedAt = now,
                UpdatedAt = now
            },
            new Product
            {
                Id = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3"),
                Name = "Plush Turtle",
                Category = "Amigurumi",
                Description = "Chenille yarn turtle with a shell you can squish. The most gifted piece in the shop.",
                Price = 749,
                Mrp = 899,
                Spec1 = "14 cm wide",
                Spec2 = "Chenille yarn",
                CourseId = null,
                SortOrder = 3,
                Status = ProductStatus.Published,
                CreatedAt = now,
                UpdatedAt = now
            },
            new Product
            {
                Id = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4"),
                Name = "Mesh Crop Top",
                Category = "Apparel",
                Description = "An open-mesh summer top in single-ply cotton, crocheted to your measurements.",
                Price = 1899,
                Mrp = 2200,
                Spec1 = "Made to size",
                Spec2 = "Cotton blend",
                CourseId = null,
                SortOrder = 4,
                Status = ProductStatus.Published,
                CreatedAt = now,
                UpdatedAt = now
            },
            new Product
            {
                Id = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5"),
                Name = "Sunday Chick",
                Category = "Amigurumi",
                Description = "A round yellow chick in a removable felted hat. Quick to make, impossible to put down.",
                Price = 649,
                Mrp = 749,
                Spec1 = "12 cm tall",
                Spec2 = "Chenille yarn",
                CourseId = null,
                SortOrder = 5,
                Status = ProductStatus.Published,
                CreatedAt = now,
                UpdatedAt = now
            },
            new Product
            {
                Id = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6"),
                Name = "Stripe Blanket",
                Category = "Home",
                Description = "A granny-stripe throw in six colours, edged in a firm double crochet border.",
                Price = 2400,
                Mrp = 2900,
                Spec1 = "90 × 70 cm",
                Spec2 = "Acrylic blend",
                CourseId = null,
                SortOrder = 6,
                Status = ProductStatus.Published,
                CreatedAt = now,
                UpdatedAt = now
            }
        };

        _db.Products.AddRange(products);
        await _db.SaveChangesAsync(cancellationToken);
        _logger.LogInformation("Seeded {Count} shop products", products.Length);
    }

    /// <summary>
    /// Undo the old startup behavior that attached every product to a course
    /// (which made every shop card show a Learn badge).
    /// </summary>
    private async Task ClearBlanketProductCourseLinksAsync(CancellationToken cancellationToken)
    {
        var linked = await _db.Products
            .Where(p => p.CourseId != null)
            .ToListAsync(cancellationToken);

        if (linked.Count < 3)
            return;

        var total = await _db.Products.CountAsync(cancellationToken);

        // If (almost) the whole catalog is course-linked, treat it as the old
        // blanket auto-link and clear every CourseId. Admins can re-link
        // individual products that should show Learn.
        var nearlyAllLinked = linked.Count >= total - 1;
        List<Product> toClear;
        if (nearlyAllLinked)
        {
            toClear = linked;
        }
        else
        {
            var dominantId = linked
                .GroupBy(p => p.CourseId!.Value)
                .OrderByDescending(g => g.Count())
                .Select(g => g.Key)
                .First();
            var dominantCount = linked.Count(p => p.CourseId == dominantId);
            if (dominantCount < 3 || dominantCount * 2 < total)
                return;
            toClear = linked.Where(p => p.CourseId == dominantId).ToList();
        }

        var now = DateTime.UtcNow;
        foreach (var product in toClear)
        {
            product.CourseId = null;
            product.UpdatedAt = now;
        }

        await _db.SaveChangesAsync(cancellationToken);
        _logger.LogInformation(
            "Cleared blanket Learn course link from {Count} products",
            toClear.Count);
    }

    /// <summary>
    /// Gives the configured test customer active enrollments in every published course.
    /// Runs on each startup so courses published later are picked up automatically.
    /// </summary>
    private async Task SeedTestAccountAsync(CancellationToken cancellationToken)
    {
        var config = _settings.TestAccount;
        if (!config.Enabled)
            return;

        if (string.IsNullOrWhiteSpace(config.Phone))
        {
            _logger.LogWarning("Seed:TestAccount:Enabled is true but Seed:TestAccount:Phone is empty. Skipping.");
            return;
        }

        string phone;
        try
        {
            phone = CustomerAccountService.NormalizePhone(config.Phone);
        }
        catch (ArgumentException)
        {
            _logger.LogWarning("Seed:TestAccount:Phone is not a valid 10-digit number. Skipping.");
            return;
        }

        var user = await _customers.GetOrCreateAsync(phone, config.Name, cancellationToken);
        var customer = await _db.Customers.SingleOrDefaultAsync(c => c.UserId == user.Id, cancellationToken);
        if (customer is null)
        {
            _logger.LogWarning("Test account user {Email} has no customer profile. Skipping.", user.Email);
            return;
        }

        var publishedCourses = await _db.Courses
            .Where(c => c.Status == CourseStatus.Published)
            .ToListAsync(cancellationToken);

        var now = DateTime.UtcNow;
        var expiry = now.AddDays(config.AccessDays <= 0 ? 3650 : config.AccessDays);

        // Keep existing enrollments from lapsing rather than stacking up duplicates.
        var existing = await _db.CourseEnrollments
            .Where(e => e.CustomerId == customer.Id)
            .ToListAsync(cancellationToken);

        foreach (var enrollment in existing.Where(e => e.AccessExpiryDate < expiry))
        {
            enrollment.AccessExpiryDate = expiry;
            enrollment.UpdatedAt = now;
        }

        var enrolledCourseIds = existing.Select(e => e.CourseId).ToHashSet();
        var missing = publishedCourses.Where(c => !enrolledCourseIds.Contains(c.Id)).ToList();

        if (missing.Count > 0)
        {
            var orderNumber = TestAccessOrderNumber(phone);
            var order = await _db.Orders.SingleOrDefaultAsync(
                o => o.OrderNumber == orderNumber && o.CustomerId == customer.Id,
                cancellationToken);

            if (order is null)
            {
                order = new Order
                {
                    Id = Guid.NewGuid(),
                    OrderNumber = orderNumber,
                    CustomerId = customer.Id,
                    Status = OrderStatus.Confirmed,
                    Currency = "INR",
                    Subtotal = 0m,
                    DiscountAmount = 0m,
                    TaxAmount = 0m,
                    ShippingAmount = 0m,
                    TotalAmount = 0m,
                    CreatedAt = now,
                    UpdatedAt = now,
                    PaidAt = now,
                    ConfirmedAt = now
                };
                _db.Orders.Add(order);
            }
            else
            {
                order.UpdatedAt = now;
            }

            foreach (var course in missing)
            {
                // Added through the sets so EF inserts them; the Guid keys are already
                // assigned, which change detection alone would read as existing rows.
                var item = new OrderItem
                {
                    Id = Guid.NewGuid(),
                    OrderId = order.Id,
                    ItemType = OrderItemType.Course,
                    CourseId = course.Id,
                    Quantity = 1,
                    UnitPrice = 0m,
                    DiscountAmount = 0m,
                    TotalAmount = 0m,
                    ItemNameSnapshot = course.Name
                };
                _db.OrderItems.Add(item);

                _db.CourseEnrollments.Add(new CourseEnrollment
                {
                    Id = Guid.NewGuid(),
                    CustomerId = customer.Id,
                    CourseId = course.Id,
                    OrderId = order.Id,
                    OrderItemId = item.Id,
                    PurchaseDate = now,
                    AccessStartDate = now,
                    AccessExpiryDate = expiry,
                    CreatedAt = now,
                    UpdatedAt = now
                });
            }
        }

        var publishedProducts = await _db.Products
            .Where(p => p.Status == ProductStatus.Published)
            .ToListAsync(cancellationToken);

        var missingProducts = new List<Product>();
        if (publishedProducts.Count > 0)
        {
            var shopOrderNumber = TestShopOrderNumber(phone);
            var shopOrder = await _db.Orders
                .Include(o => o.Items)
                .SingleOrDefaultAsync(
                    o => o.OrderNumber == shopOrderNumber && o.CustomerId == customer.Id,
                    cancellationToken);

            if (shopOrder is null)
            {
                shopOrder = new Order
                {
                    Id = Guid.NewGuid(),
                    OrderNumber = shopOrderNumber,
                    CustomerId = customer.Id,
                    Status = OrderStatus.Confirmed,
                    Currency = "INR",
                    Subtotal = 0m,
                    DiscountAmount = 0m,
                    TaxAmount = 0m,
                    ShippingAmount = 0m,
                    TotalAmount = 0m,
                    CreatedAt = now,
                    UpdatedAt = now,
                    PaidAt = now,
                    ConfirmedAt = now
                };
                _db.Orders.Add(shopOrder);
            }

            var existingProductIds = shopOrder.Items
                .Where(i => i.ProductId.HasValue)
                .Select(i => i.ProductId!.Value)
                .ToHashSet();
            missingProducts = publishedProducts.Where(p => !existingProductIds.Contains(p.Id)).ToList();

            foreach (var product in missingProducts)
            {
                var price = product.Price;
                _db.OrderItems.Add(new OrderItem
                {
                    Id = Guid.NewGuid(),
                    OrderId = shopOrder.Id,
                    ItemType = OrderItemType.Product,
                    ProductId = product.Id,
                    Quantity = 1,
                    UnitPrice = price,
                    DiscountAmount = 0m,
                    TotalAmount = price,
                    ItemNameSnapshot = product.Name
                });
            }

            if (missingProducts.Count > 0)
            {
                var addedTotal = missingProducts.Sum(p => (decimal)p.Price);
                shopOrder.Subtotal += addedTotal;
                shopOrder.TotalAmount += addedTotal;
                shopOrder.PaidAt ??= now;
                shopOrder.ConfirmedAt ??= now;
                shopOrder.UpdatedAt = now;
            }
        }

        await _db.SaveChangesAsync(cancellationToken);

        _logger.LogInformation(
            "Test account {Phone} ready: {NewCourses} new enrollment(s) of {TotalCourses} course(s), {NewProducts} new shop item(s) of {TotalProducts} product(s), access until {Expiry:u}",
            phone,
            missing.Count,
            publishedCourses.Count,
            missingProducts.Count,
            publishedProducts.Count,
            expiry);
    }
}
