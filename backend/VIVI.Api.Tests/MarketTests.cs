using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using VIVI.Api.DTOs.Courses;
using VIVI.Api.DTOs.Enrollments;
using VIVI.Api.DTOs.Offers;
using VIVI.Api.DTOs.Orders;
using VIVI.Api.DTOs.Products;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Infrastructure.Commerce;
using VIVI.Infrastructure.Data;
using Xunit;

namespace VIVI.Api.Tests;

/// <summary>
/// Country-based selling: outside India only courses (and the founding membership) can be bought,
/// in that country's own currency. Products and live classes are India-only.
/// </summary>
[Collection("CatalogPricing")]
public sealed class MarketTests
{
    private static int _phones = 6_000_000;
    private readonly ApiFactory _factory;

    public MarketTests(ApiFactory factory)
    {
        _factory = factory;
        _ = factory.CreateClient();
    }

    private static string NextPhone() => (9_100_000_000L + Interlocked.Increment(ref _phones)).ToString();

    private async Task<HttpClient> CustomerAsync(string? country)
    {
        var client = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        if (country is not null)
        {
            (await client.PatchAsJsonAsync("/api/me/preferences", new { countryCode = country }))
                .EnsureSuccessStatusCode();
        }
        return client;
    }

    private HttpClient Guest(string? countryHeader)
    {
        var client = _factory.CreateClient();
        if (countryHeader is not null)
            client.DefaultRequestHeaders.Add("X-Vivi-Country", countryHeader);
        return client;
    }

    /// <summary>Sets (or with a null price, removes) a course's US price directly in the database.</summary>
    private async Task SetUsPriceAsync(
        Guid courseId,
        decimal? price,
        decimal? mrp = null,
        decimal? launch = null,
        decimal? regular = null)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
        var existing = await db.CoursePrices.SingleOrDefaultAsync(p => p.CourseId == courseId && p.CountryCode == "US");
        if (price is null)
        {
            if (existing is not null) db.CoursePrices.Remove(existing);
        }
        else
        {
            if (existing is null)
            {
                existing = new CoursePrice { Id = Guid.NewGuid(), CourseId = courseId, CountryCode = "US", Currency = "USD" };
                db.CoursePrices.Add(existing);
            }
            existing.Price = price.Value;
            existing.Mrp = mrp;
            existing.LaunchPrice = launch;
            existing.RegularPriceAfterLaunch = regular;
            existing.UpdatedAt = DateTime.UtcNow;
        }
        await db.SaveChangesAsync();
    }

    private async Task ResetLaunchCountAsync(int count)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
        var offer = await db.LaunchOfferCounters.SingleAsync(c => c.CourseId == DatabaseSeeder.Catalog.BundleId);
        offer.CompletedPurchaseCount = count;
        offer.IsActive = true;
        await db.SaveChangesAsync();
        db.LaunchMemberships.RemoveRange(await db.LaunchMemberships.Where(m => m.CourseId == DatabaseSeeder.Catalog.BundleId).ToListAsync());
        await db.SaveChangesAsync();
    }

    private async Task<Guid> PublishProductAsync()
    {
        var admin = _factory.CreateClient();
        AuthTests.WithToken(admin, await AuthTests.LoginAsync(admin));
        var created = await admin.PostAsJsonAsync("/api/products", new
        {
            name = $"Market {Guid.NewGuid():N}"[..14],
            category = "Amigurumi",
            price = 799,
            productType = "Handmade",
            availableStock = 10
        });
        created.EnsureSuccessStatusCode();
        var product = await created.Content.ReadFromJsonAsync<ProductResponse>(AuthTests.Json);
        await admin.PostAsync($"/api/products/{product!.Id}/publish", null);
        return product.Id;
    }

    private static async Task<CreateOrderResponse> OrderCourseAsync(HttpClient customer, Guid courseId)
    {
        var response = await customer.PostAsJsonAsync("/api/orders", new
        {
            items = new[] { new { itemType = "Course", courseId, quantity = 1 } }
        });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<CreateOrderResponse>(AuthTests.Json))!;
    }

    private static async Task<string> ErrorTextAsync(HttpResponseMessage response)
        => await response.Content.ReadAsStringAsync();

    // ---- products and live classes are India-only ---------------------------------------

    [Fact]
    public async Task Us_customer_cannot_order_products()
    {
        var productId = await PublishProductAsync();
        var us = await CustomerAsync("US");

        var response = await us.PostAsJsonAsync("/api/orders", new
        {
            items = new[] { new { itemType = "Product", productId, quantity = 1 } },
            paymentMethod = "OnlinePayment",
            shippingAddress = new
            {
                fullName = "Asha Kumar", phoneNumber = "9876500001", addressLine1 = "12 Main St",
                city = "Austin", state = "Texas", pinCode = "73301", country = "United States"
            }
        });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("PRODUCTS_NOT_AVAILABLE_IN_COUNTRY", await ErrorTextAsync(response));
    }

    [Fact]
    public async Task Us_customer_cannot_get_a_product_delivery_quote()
    {
        var productId = await PublishProductAsync();
        var us = await CustomerAsync("US");
        var response = await us.PostAsJsonAsync("/api/orders/delivery-quote", new
        {
            items = new[] { new { itemType = "Product", productId, quantity = 1 } },
            shippingAddress = new
            {
                fullName = "Asha Kumar", phoneNumber = "9876500001", addressLine1 = "12 Main St",
                city = "Austin", state = "Texas", pinCode = "641001"
            }
        });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("PRODUCTS_NOT_AVAILABLE_IN_COUNTRY", await ErrorTextAsync(response));
    }

    [Fact]
    public async Task India_customer_can_still_order_products()
    {
        var productId = await PublishProductAsync();
        var india = await CustomerAsync("IN");
        var response = await india.PostAsJsonAsync("/api/orders", new
        {
            items = new[] { new { itemType = "Product", productId, quantity = 1 } },
            paymentMethod = "OnlinePayment",
            shippingAddress = new
            {
                fullName = "Asha Kumar", phoneNumber = "9876500001", addressLine1 = "12 Race Course",
                city = "Coimbatore", state = "Tamil Nadu", pinCode = "641001"
            }
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Fact]
    public async Task Us_customer_cannot_book_a_live_class()
    {
        var us = await CustomerAsync("US");
        var response = await us.PostAsJsonAsync("/api/live/bookings", new { weekId = Guid.NewGuid(), slotType = "Morning" });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("LIVE_NOT_AVAILABLE_IN_COUNTRY", await ErrorTextAsync(response));
    }

    [Fact]
    public async Task India_customer_is_not_blocked_from_live_booking_by_country()
    {
        var india = await CustomerAsync("IN");
        var response = await india.PostAsJsonAsync("/api/live/bookings", new { weekId = Guid.NewGuid(), slotType = "Morning" });
        Assert.DoesNotContain("LIVE_NOT_AVAILABLE_IN_COUNTRY", await ErrorTextAsync(response));
    }

    // ---- course prices per country --------------------------------------------------------

    [Fact]
    public async Task Course_shows_the_us_price_in_dollars_to_us_guests_and_rupees_to_everyone_else()
    {
        var courseId = DatabaseSeeder.Catalog.FoundationId;
        await SetUsPriceAsync(courseId, 19.99m, mrp: 39.99m);

        var us = await Guest("US").GetFromJsonAsync<CourseResponse>($"/api/courses/{courseId}", AuthTests.Json);
        Assert.Equal("USD", us!.Currency);
        Assert.Equal(19.99m, us.Price);
        Assert.Equal(39.99m, us.Mrp);
        Assert.True(us.AvailableInMarket);

        var india = await Guest(null).GetFromJsonAsync<CourseResponse>($"/api/courses/{courseId}", AuthTests.Json);
        Assert.Equal("INR", india!.Currency);
        Assert.NotEqual(19.99m, india.Price);

        var listed = await Guest("US").GetFromJsonAsync<List<CourseResponse>>("/api/courses", AuthTests.Json);
        Assert.Equal(19.99m, listed!.Single(c => c.Id == courseId).Price);
    }

    [Fact]
    public async Task Course_without_a_us_price_is_marked_unavailable_for_us()
    {
        var courseId = DatabaseSeeder.Catalog.FoundationId;
        await SetUsPriceAsync(courseId, null);

        var us = await Guest("US").GetFromJsonAsync<CourseResponse>($"/api/courses/{courseId}", AuthTests.Json);
        Assert.False(us!.AvailableInMarket);
        Assert.Equal("USD", us.Currency);

        var pricing = await Guest("US").GetFromJsonAsync<CoursePricingResponse>($"/api/courses/{courseId}/pricing", AuthTests.Json);
        Assert.False(pricing!.AvailableInMarket);
    }

    [Fact]
    public async Task Us_customer_buys_a_course_in_usd_and_gets_enrolled()
    {
        var courseId = DatabaseSeeder.Catalog.FoundationId;
        await SetUsPriceAsync(courseId, 19.99m);
        var us = await CustomerAsync("US");

        var order = await OrderCourseAsync(us, courseId);
        Assert.Equal("USD", order.Currency);
        Assert.Equal(19.99m, order.TotalAmount);
        Assert.Equal(1999, order.AmountPaise);

        await OrderTestsHelper.VerifyPaymentAsync(us, order);
        var enrollments = await us.GetFromJsonAsync<List<EnrollmentResponse>>("/api/me/enrollments", AuthTests.Json);
        Assert.Contains(enrollments!, e => e.CourseId == courseId);
    }

    [Fact]
    public async Task Us_customer_cannot_buy_a_course_that_has_no_us_price()
    {
        var courseId = DatabaseSeeder.Catalog.FoundationId;
        await SetUsPriceAsync(courseId, null);
        var us = await CustomerAsync("US");

        var response = await us.PostAsJsonAsync("/api/orders", new
        {
            items = new[] { new { itemType = "Course", courseId, quantity = 1 } }
        });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("COURSE_NOT_AVAILABLE_IN_COUNTRY", await ErrorTextAsync(response));
    }

    [Fact]
    public async Task India_customer_still_pays_in_rupees_even_if_the_app_claims_us()
    {
        var courseId = DatabaseSeeder.Catalog.FoundationId;
        await SetUsPriceAsync(courseId, 19.99m);
        var india = await CustomerAsync("IN");
        india.DefaultRequestHeaders.Add("X-Vivi-Country", "US");

        var course = await india.GetFromJsonAsync<CourseResponse>($"/api/courses/{courseId}", AuthTests.Json);
        Assert.Equal("INR", course!.Currency);

        var order = await OrderCourseAsync(india, courseId);
        Assert.Equal("INR", order.Currency);
    }

    [Fact]
    public async Task Customer_who_never_chose_a_country_is_treated_as_india()
    {
        var courseId = DatabaseSeeder.Catalog.FoundationId;
        await SetUsPriceAsync(courseId, 19.99m);
        var legacy = await CustomerAsync(null);

        var order = await OrderCourseAsync(legacy, courseId);
        Assert.Equal("INR", order.Currency);
    }

    // ---- founding membership in the US ------------------------------------------------------

    [Fact]
    public async Task Founding_membership_offer_shows_us_prices_and_us_purchase_grants_a_membership()
    {
        await ResetLaunchCountAsync(0);
        var bundleId = DatabaseSeeder.Catalog.BundleId;
        await SetUsPriceAsync(bundleId, 39.99m, mrp: 59.99m, launch: 12.99m, regular: 39.99m);

        var offer = await Guest("US").GetFromJsonAsync<FoundingMembershipOfferResponse>("/api/offers/founding-membership", AuthTests.Json);
        Assert.Equal("USD", offer!.Currency);
        Assert.Equal(12.99m, offer.LaunchPrice);
        Assert.Equal(39.99m, offer.RegularPriceAfterLaunch);
        Assert.Equal(59.99m, offer.Mrp);
        Assert.True(offer.AvailableInMarket);
        Assert.True(offer.Remaining > 0);

        var inr = await Guest(null).GetFromJsonAsync<FoundingMembershipOfferResponse>("/api/offers/founding-membership", AuthTests.Json);
        Assert.Equal("INR", inr!.Currency);
        Assert.Equal(999m, inr.LaunchPrice);

        var us = await CustomerAsync("US");
        var order = await OrderCourseAsync(us, bundleId);
        Assert.Equal("USD", order.Currency);
        Assert.Equal(12.99m, order.TotalAmount);
        await OrderTestsHelper.VerifyPaymentAsync(us, order);

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
        var membership = await db.LaunchMemberships.SingleAsync(m => m.OrderId == order.OrderId);
        Assert.Equal(1, membership.MemberNumber);
        Assert.Equal(1, (await db.LaunchOfferCounters.SingleAsync(c => c.CourseId == bundleId)).CompletedPurchaseCount);

        await SetUsPriceAsync(bundleId, null);
        await ResetLaunchCountAsync(0);
    }

    [Fact]
    public async Task Us_purchase_after_the_offer_sells_out_pays_the_us_regular_price()
    {
        await ResetLaunchCountAsync(100);
        var bundleId = DatabaseSeeder.Catalog.BundleId;
        await SetUsPriceAsync(bundleId, 39.99m, launch: 12.99m, regular: 34.99m);

        var us = await CustomerAsync("US");
        var order = await OrderCourseAsync(us, bundleId);
        Assert.Equal(34.99m, order.TotalAmount);
        await OrderTestsHelper.VerifyPaymentAsync(us, order);

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
        Assert.Empty(await db.LaunchMemberships.Where(m => m.OrderId == order.OrderId).ToListAsync());

        await SetUsPriceAsync(bundleId, null);
        await ResetLaunchCountAsync(0);
    }

    [Fact]
    public async Task Founding_membership_is_not_offered_in_the_us_until_a_us_price_is_set()
    {
        await ResetLaunchCountAsync(0);
        await SetUsPriceAsync(DatabaseSeeder.Catalog.BundleId, null);

        var offer = await Guest("US").GetFromJsonAsync<FoundingMembershipOfferResponse>("/api/offers/founding-membership", AuthTests.Json);
        Assert.False(offer!.AvailableInMarket);
        Assert.Equal(0, offer.Remaining);
    }

    // ---- admin sets the prices ----------------------------------------------------------------

    private async Task<HttpClient> AdminAsync()
    {
        var admin = _factory.CreateClient();
        AuthTests.WithToken(admin, await AuthTests.LoginAsync(admin));
        return admin;
    }

    [Fact]
    public async Task Admin_can_set_and_remove_a_us_price_on_a_course()
    {
        var admin = await AdminAsync();
        var created = await admin.PostAsJsonAsync("/api/courses", new
        {
            name = $"USD {Guid.NewGuid():N}"[..12],
            type = "DigitalCourse",
            price = 499,
            accessDays = 30,
            marketPrices = new[] { new { countryCode = "US", price = 24.5m, mrp = 49m } }
        });
        created.EnsureSuccessStatusCode();
        var course = await created.Content.ReadFromJsonAsync<CourseResponse>(AuthTests.Json);
        var us = Assert.Single(course!.MarketPrices!);
        Assert.Equal("US", us.CountryCode);
        Assert.Equal("USD", us.Currency);
        Assert.Equal(24.5m, us.Price);
        Assert.Equal(49m, us.Mrp);
        Assert.Equal(499m, course.Price); // admin still sees the India price

        var removed = await admin.PutAsJsonAsync($"/api/courses/{course.Id}", new
        {
            name = course.Name,
            type = "DigitalCourse",
            price = 499,
            accessDays = 30,
            marketPrices = Array.Empty<object>()
        });
        removed.EnsureSuccessStatusCode();
        var after = await removed.Content.ReadFromJsonAsync<CourseResponse>(AuthTests.Json);
        Assert.Empty(after!.MarketPrices!);
    }

    [Fact]
    public async Task Leaving_market_prices_out_of_a_course_update_keeps_them()
    {
        var admin = await AdminAsync();
        var created = await admin.PostAsJsonAsync("/api/courses", new
        {
            name = $"Keep {Guid.NewGuid():N}"[..12],
            type = "DigitalCourse",
            price = 499,
            accessDays = 30,
            marketPrices = new[] { new { countryCode = "US", price = 10m } }
        });
        var course = await created.Content.ReadFromJsonAsync<CourseResponse>(AuthTests.Json);

        var updated = await admin.PutAsJsonAsync($"/api/courses/{course!.Id}", new
        {
            name = course.Name + " v2",
            type = "DigitalCourse",
            price = 499,
            accessDays = 30
        });
        var after = await updated.Content.ReadFromJsonAsync<CourseResponse>(AuthTests.Json);
        Assert.Single(after!.MarketPrices!);
    }

    [Theory]
    [InlineData("GB", 10)]
    [InlineData("IN", 10)]
    [InlineData("US", 0)]
    [InlineData("US", -5)]
    public async Task Invalid_market_prices_are_rejected(string country, decimal price)
    {
        var admin = await AdminAsync();
        var response = await admin.PostAsJsonAsync("/api/courses", new
        {
            name = $"Bad {Guid.NewGuid():N}"[..12],
            type = "DigitalCourse",
            price = 499,
            accessDays = 30,
            marketPrices = new[] { new { countryCode = country, price } }
        });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public void Renewal_price_keeps_cents_for_dollar_prices()
    {
        Assert.Equal(14.99m, PricingService.ComputeRenewalPrice(29.98m, 50, decimals: 2));
        Assert.Equal(0.01m, PricingService.ComputeRenewalPrice(0.01m, 99, decimals: 2));
        // Rupee prices keep whole-rupee rounding.
        Assert.Equal(150, PricingService.ComputeRenewalPrice(299, 50));
    }
}
