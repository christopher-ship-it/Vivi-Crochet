using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using VIVI.Api.DTOs.Courses;
using VIVI.Api.DTOs.Enrollments;
using VIVI.Api.DTOs.Orders;
using VIVI.Core.Enums;
using VIVI.Infrastructure.Commerce;
using VIVI.Infrastructure.Data;
using Xunit;

namespace VIVI.Api.Tests;

[CollectionDefinition("CatalogPricing", DisableParallelization = true)]
public sealed class CatalogPricingCollection : ICollectionFixture<ApiFactory>;

[Collection("CatalogPricing")]
public sealed class CatalogPricingTests
{
    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter() }
    };

    private static int PhoneSeq;

    private readonly ApiFactory _factory;

    public CatalogPricingTests(ApiFactory factory)
    {
        _factory = factory;
        _ = factory.CreateClient();
    }

    [Fact]
    public async Task Foundation_price_is_299_and_access_is_30_days()
    {
        var pricing = await GetPricingAsync(DatabaseSeeder.Catalog.FoundationId);
        Assert.Equal("Foundation Stitches", pricing.Name);
        Assert.Equal(299, pricing.Price);
        Assert.Equal(299, pricing.ListPrice);
        Assert.Equal(30, pricing.AccessDays);
        Assert.False(pricing.IsLaunchOffer);
    }

    [Fact]
    public async Task Signature_price_is_599_and_access_is_45_days()
    {
        var pricing = await GetPricingAsync(DatabaseSeeder.Catalog.SignatureId);
        Assert.Equal("Signature Stitches", pricing.Name);
        Assert.Equal(599, pricing.Price);
        Assert.Equal(45, pricing.AccessDays);
        Assert.False(pricing.IsLaunchOffer);
    }

    [Fact]
    public async Task Master_price_is_1099_and_access_is_60_days()
    {
        var pricing = await GetPricingAsync(DatabaseSeeder.Catalog.MasterId);
        Assert.Equal("Master Stitch Series", pricing.Name);
        Assert.Equal(1099, pricing.Price);
        Assert.Equal(60, pricing.AccessDays);
        Assert.False(pricing.IsLaunchOffer);
    }

    [Fact]
    public async Task Bundle_mrp_standard_price_and_access_days()
    {
        await ResetLaunchCountAsync(0);
        var client = _factory.CreateClient();
        var course = await client.GetFromJsonAsync<CourseResponse>(
            $"/api/courses/{DatabaseSeeder.Catalog.BundleId}", Json);

        Assert.Equal(1997, course!.Mrp);
        Assert.Equal(1699, course.Price);
        Assert.Equal(30, course.AccessDays);
        Assert.Equal(CourseType.Bundle, course.Type);

        var pricing = await GetPricingAsync(DatabaseSeeder.Catalog.BundleId);
        Assert.Equal(1997, pricing.Mrp);
        Assert.Equal(1699, pricing.ListPrice);
        Assert.Equal(999, pricing.Price);
        Assert.Equal(30, pricing.AccessDays);
        Assert.True(pricing.IsLaunchOffer);
        Assert.Equal(100, pricing.LaunchOfferRemaining);
    }

    [Fact]
    public async Task First_successful_bundle_purchase_is_999()
    {
        await ResetLaunchCountAsync(0);
        var order = await PayBundleAsync(NextPhone());
        Assert.Equal(999m, order.TotalAmount);
        Assert.Equal(99900, order.AmountPaise);
        Assert.Equal(1, await GetLaunchCountAsync());
    }

    [Fact]
    public async Task Ninety_ninth_successful_bundle_purchase_is_999()
    {
        await ResetLaunchCountAsync(98);
        var order = await PayBundleAsync(NextPhone());
        Assert.Equal(999m, order.TotalAmount);
        Assert.Equal(99, await GetLaunchCountAsync());
    }

    [Fact]
    public async Task Hundredth_successful_bundle_purchase_is_999()
    {
        await ResetLaunchCountAsync(99);
        var pricing = await GetPricingAsync(DatabaseSeeder.Catalog.BundleId);
        Assert.Equal(999, pricing.Price);
        Assert.True(pricing.IsLaunchOffer);
        Assert.Equal(1, pricing.LaunchOfferRemaining);

        var order = await PayBundleAsync(NextPhone());
        Assert.Equal(999m, order.TotalAmount);
        Assert.Equal(100, await GetLaunchCountAsync());

        var after = await GetPricingAsync(DatabaseSeeder.Catalog.BundleId);
        Assert.Equal(1699, after.Price);
        Assert.False(after.IsLaunchOffer);
        Assert.Equal(0, after.LaunchOfferRemaining);
    }

    [Fact]
    public async Task Hundred_and_first_successful_bundle_purchase_is_1699()
    {
        await ResetLaunchCountAsync(100);
        var pricing = await GetPricingAsync(DatabaseSeeder.Catalog.BundleId);
        Assert.Equal(1699, pricing.Price);
        Assert.Equal(1997, pricing.Mrp);
        Assert.False(pricing.IsLaunchOffer);
        Assert.Equal(0, pricing.LaunchOfferRemaining);

        var order = await PayBundleAsync(NextPhone());
        Assert.Equal(1699m, order.TotalAmount);
        Assert.Equal(169900, order.AmountPaise);
        Assert.Equal(100, await GetLaunchCountAsync());
    }

    [Fact]
    public async Task Failed_payment_does_not_consume_launch_slot()
    {
        await ResetLaunchCountAsync(0);
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var order = await CreateBundleOrderAsync(customer);
        Assert.Equal(999m, order.TotalAmount);

        var failed = await customer.PostAsJsonAsync("/api/payments/razorpay/verify", new
        {
            internalOrderId = order.OrderId,
            razorpayOrderId = order.RazorpayOrderId,
            razorpayPaymentId = "pay_failed",
            razorpaySignature = "bad_signature"
        });
        Assert.Equal(HttpStatusCode.Conflict, failed.StatusCode);
        Assert.Equal(0, await GetLaunchCountAsync());
    }

    [Fact]
    public async Task Checkout_does_not_consume_launch_slot()
    {
        await ResetLaunchCountAsync(0);
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var order = await CreateBundleOrderAsync(customer);
        Assert.Equal(999m, order.TotalAmount);
        Assert.False(string.IsNullOrWhiteSpace(order.RazorpayOrderId));
        Assert.Equal(0, await GetLaunchCountAsync());
    }

    [Fact]
    public async Task Razorpay_order_creation_does_not_consume_launch_slot()
    {
        await ResetLaunchCountAsync(5);
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var order = await CreateBundleOrderAsync(customer);
        Assert.Equal(99900, order.AmountPaise);
        Assert.Equal(5, await GetLaunchCountAsync());
    }

    [Fact]
    public async Task Concurrent_last_slot_allows_only_one_launch_price_purchase()
    {
        await ResetLaunchCountAsync(99);
        var customerA = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var customerB = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var orderA = await CreateBundleOrderAsync(customerA);
        var orderB = await CreateBundleOrderAsync(customerB);
        Assert.Equal(999m, orderA.TotalAmount);
        Assert.Equal(999m, orderB.TotalAmount);

        var results = await Task.WhenAll(
            VerifyPaymentRawAsync(customerA, orderA),
            VerifyPaymentRawAsync(customerB, orderB));

        var successes = results.Count(r => r.IsSuccessStatusCode);
        var conflicts = results.Count(r => r.StatusCode == HttpStatusCode.Conflict);
        Assert.Equal(1, successes);
        Assert.Equal(1, conflicts);
        Assert.Equal(100, await GetLaunchCountAsync());

        var pricing = await GetPricingAsync(DatabaseSeeder.Catalog.BundleId);
        Assert.Equal(1699, pricing.Price);
        Assert.False(pricing.IsLaunchOffer);
    }

    [Fact]
    public async Task Mobile_cannot_override_server_price()
    {
        await ResetLaunchCountAsync(0);
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var response = await customer.PostAsJsonAsync("/api/orders", new
        {
            totalAmount = 1,
            price = 1,
            mrp = 1,
            items = new[]
            {
                new
                {
                    itemType = "Course",
                    courseId = DatabaseSeeder.Catalog.BundleId,
                    quantity = 1,
                    unitPrice = 1,
                    price = 1,
                    mrp = 1,
                    discount = 0,
                    total = 1
                }
            }
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<CreateOrderResponse>(Json);
        Assert.Equal(999m, body!.TotalAmount);
        Assert.Equal(99900, body.AmountPaise);
    }

    [Fact]
    public async Task OrderItem_stores_actual_purchase_price()
    {
        await ResetLaunchCountAsync(0);
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var created = await CreateBundleOrderAsync(customer);
        await VerifyPaymentAsync(customer, created);

        var order = await customer.GetFromJsonAsync<OrderResponse>($"/api/orders/{created.OrderId}", Json);
        var item = Assert.Single(order!.Items);
        Assert.Equal(DatabaseSeeder.Catalog.BundleId, item.CourseId);
        Assert.Equal(999m, item.UnitPrice);
        Assert.Equal(999m, item.TotalAmount);
        Assert.Equal(1997m - 999m, item.DiscountAmount);
        Assert.Equal(OrderItemType.CourseBundle, item.ItemType);
    }

    [Fact]
    public async Task Historical_order_price_is_unchanged_after_launch_offer_ends()
    {
        await ResetLaunchCountAsync(0);
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var created = await CreateBundleOrderAsync(customer);
        await VerifyPaymentAsync(customer, created);

        await ResetLaunchCountAsync(100);
        var pricing = await GetPricingAsync(DatabaseSeeder.Catalog.BundleId);
        Assert.Equal(1699, pricing.Price);
        Assert.False(pricing.IsLaunchOffer);

        var order = await customer.GetFromJsonAsync<OrderResponse>($"/api/orders/{created.OrderId}", Json);
        Assert.Equal(999m, order!.TotalAmount);
        Assert.Equal(999m, Assert.Single(order.Items).UnitPrice);
    }

    [Fact]
    public async Task Stale_launch_checkout_cannot_be_paid_after_offer_ends()
    {
        await ResetLaunchCountAsync(99);
        var abandoned = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var stale = await CreateBundleOrderAsync(abandoned);
        Assert.Equal(999m, stale.TotalAmount);

        var winner = await PayBundleAsync(NextPhone());
        Assert.Equal(999m, winner.TotalAmount);
        Assert.Equal(100, await GetLaunchCountAsync());

        var stalePay = await VerifyPaymentRawAsync(abandoned, stale);
        Assert.Equal(HttpStatusCode.Conflict, stalePay.StatusCode);
        Assert.Equal(100, await GetLaunchCountAsync());
    }

    [Fact]
    public async Task Bundle_references_included_courses_without_duplicating_videos()
    {
        var client = _factory.CreateClient();
        var bundle = await client.GetFromJsonAsync<CourseResponse>(
            $"/api/courses/{DatabaseSeeder.Catalog.BundleId}", Json);

        Assert.NotNull(bundle!.IncludedCourses);
        var includedIds = bundle.IncludedCourses!.Select(c => c.Id).ToHashSet();
        Assert.Contains(DatabaseSeeder.Catalog.FoundationId, includedIds);
        Assert.Contains(DatabaseSeeder.Catalog.SignatureId, includedIds);
        Assert.Contains(DatabaseSeeder.Catalog.MasterId, includedIds);
        Assert.Equal(3, includedIds.Count);

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
        Assert.Equal(0, await db.Videos.CountAsync(v => v.CourseId == DatabaseSeeder.Catalog.BundleId));
        Assert.Equal(3, await db.CourseBundleItems.CountAsync(b => b.BundleCourseId == DatabaseSeeder.Catalog.BundleId));
    }

    [Fact]
    public async Task Bundle_enrollment_uses_bundle_access_days()
    {
        await ResetLaunchCountAsync(0);
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var created = await CreateBundleOrderAsync(customer);
        await VerifyPaymentAsync(customer, created);

        var enrollments = await customer.GetFromJsonAsync<List<EnrollmentResponse>>("/api/me/enrollments", Json);
        Assert.Equal(3, enrollments!.Count);
        Assert.All(enrollments, e =>
            Assert.Equal(30, (e.AccessExpiryDate - e.AccessStartDate).Days));
        var enrolledCourseIds = enrollments.Select(e => e.CourseId).ToHashSet();
        Assert.Contains(DatabaseSeeder.Catalog.FoundationId, enrolledCourseIds);
        Assert.Contains(DatabaseSeeder.Catalog.SignatureId, enrolledCourseIds);
        Assert.Contains(DatabaseSeeder.Catalog.MasterId, enrolledCourseIds);
        Assert.DoesNotContain(DatabaseSeeder.Catalog.BundleId, enrolledCourseIds);
    }

    private static string NextPhone() => (8100000000L + Interlocked.Increment(ref PhoneSeq)).ToString();

    private async Task<CoursePricingResponse> GetPricingAsync(Guid courseId)
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync($"/api/courses/{courseId}/pricing");
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<CoursePricingResponse>(Json))!;
    }

    private async Task<CreateOrderResponse> CreateBundleOrderAsync(HttpClient customer)
    {
        var response = await customer.PostAsJsonAsync("/api/orders", new
        {
            items = new[]
            {
                new { itemType = "Course", courseId = DatabaseSeeder.Catalog.BundleId, quantity = 1 }
            }
        });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<CreateOrderResponse>(Json))!;
    }

    private async Task<CreateOrderResponse> PayBundleAsync(string phone)
    {
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), phone);
        var order = await CreateBundleOrderAsync(customer);
        await VerifyPaymentAsync(customer, order);
        return order;
    }

    private static async Task VerifyPaymentAsync(HttpClient customer, CreateOrderResponse order)
    {
        var response = await VerifyPaymentRawAsync(customer, order);
        response.EnsureSuccessStatusCode();
    }

    private static async Task<HttpResponseMessage> VerifyPaymentRawAsync(
        HttpClient customer,
        CreateOrderResponse order)
    {
        var paymentId = FakeRazorpayPaymentGateway.BuildTestPaymentId(order.RazorpayOrderId);
        var signature = FakeRazorpayPaymentGateway.BuildTestSignature(order.RazorpayOrderId, paymentId);
        return await customer.PostAsJsonAsync("/api/payments/razorpay/verify", new
        {
            internalOrderId = order.OrderId,
            razorpayOrderId = order.RazorpayOrderId,
            razorpayPaymentId = paymentId,
            razorpaySignature = signature
        });
    }

    private async Task ResetLaunchCountAsync(int count)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
        var offer = await db.LaunchOfferCounters
            .SingleAsync(c => c.CourseId == DatabaseSeeder.Catalog.BundleId);
        offer.CompletedPurchaseCount = count;
        offer.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
    }

    private async Task<int> GetLaunchCountAsync()
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
        return await db.LaunchOfferCounters
            .Where(c => c.CourseId == DatabaseSeeder.Catalog.BundleId)
            .Select(c => c.CompletedPurchaseCount)
            .SingleAsync();
    }
}
