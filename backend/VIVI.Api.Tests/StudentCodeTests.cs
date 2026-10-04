using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using VIVI.Api.DTOs.Offers;
using VIVI.Api.DTOs.Orders;
using VIVI.Core.Enums;
using VIVI.Infrastructure.Commerce;
using VIVI.Infrastructure.Data;
using Xunit;

namespace VIVI.Api.Tests;

[Collection("CatalogPricing")]
public sealed class StudentCodeTests
{
    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter() }
    };

    private static int PhoneSeq = 7_000_000;

    private readonly ApiFactory _factory;

    public StudentCodeTests(ApiFactory factory)
    {
        _factory = factory;
        _ = factory.CreateClient();
    }

    [Fact]
    public async Task Student_pays_student_price_and_does_not_use_a_launch_slot()
    {
        await ResetOfferAsync(launchCount: 40);
        var code = await CreateCodeAsync();
        var student = await LoginAsync();

        var order = await CreateBundleOrderAsync(student, code.Code);
        Assert.Equal(999m, order.TotalAmount);
        await VerifyPaymentAsync(student, order);

        Assert.Equal(40, await GetLaunchCountAsync());

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
        var membership = await db.LaunchMemberships.SingleAsync(m => m.OrderId == order.OrderId);
        Assert.True(membership.IsStudent);
        Assert.Equal(code.Id, membership.StudentCodeId);
        Assert.StartsWith("VS-", membership.MemberCode);
        Assert.Equal(1, (await db.StudentCodes.SingleAsync(c => c.Id == code.Id)).UsedCount);
    }

    [Fact]
    public async Task Student_can_still_buy_after_all_launch_slots_are_sold()
    {
        await ResetOfferAsync(launchCount: 100);
        var code = await CreateCodeAsync();
        var student = await LoginAsync();

        var order = await CreateBundleOrderAsync(student, code.Code);
        Assert.Equal(999m, order.TotalAmount);
        await VerifyPaymentAsync(student, order);
        Assert.Equal(100, await GetLaunchCountAsync());

        // Someone without a code pays the regular price.
        var regular = await CreateBundleOrderAsync(await LoginAsync(), null);
        Assert.Equal(1699m, regular.TotalAmount);
    }

    [Fact]
    public async Task Student_numbers_are_a_separate_series_from_launch_members()
    {
        await ResetOfferAsync(launchCount: 0);
        var code = await CreateCodeAsync();

        var first = await LoginAsync();
        var firstOrder = await CreateBundleOrderAsync(first, code.Code);
        await VerifyPaymentAsync(first, firstOrder);
        var second = await LoginAsync();
        var secondOrder = await CreateBundleOrderAsync(second, code.Code);
        await VerifyPaymentAsync(second, secondOrder);

        // A regular launch purchase still gets member number 1 while students are numbered on their own.
        var founder = await LoginAsync();
        var founderOrder = await CreateBundleOrderAsync(founder, null);
        await VerifyPaymentAsync(founder, founderOrder);

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
        var students = await db.LaunchMemberships
            .Where(m => m.OrderId == firstOrder.OrderId || m.OrderId == secondOrder.OrderId)
            .OrderBy(m => m.MemberNumber).ToListAsync();
        Assert.Equal(2, students.Count);
        Assert.Equal(students[0].MemberNumber + 1, students[1].MemberNumber);

        var launch = await db.LaunchMemberships.SingleAsync(m => m.OrderId == founderOrder.OrderId);
        Assert.False(launch.IsStudent);
        Assert.Equal(1, launch.MemberNumber);
        Assert.Equal(1, await GetLaunchCountAsync());
    }

    [Fact]
    public async Task Unknown_code_is_rejected()
    {
        await ResetOfferAsync(launchCount: 0);
        var response = await PostOrderAsync(await LoginAsync(), "VIVISTUDENT0000");
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("STUDENT_CODE_INVALID", await ErrorCodeAsync(response));
    }

    [Fact]
    public async Task Code_matches_ignoring_case_spaces_and_dashes()
    {
        await ResetOfferAsync(launchCount: 0);
        var code = await CreateCodeAsync();
        var typed = code.Code.ToLowerInvariant().Insert(4, "-").Insert(10, " ");
        var order = await CreateBundleOrderAsync(await LoginAsync(), typed);
        Assert.Equal(999m, order.TotalAmount);
    }

    [Fact]
    public async Task Inactive_and_expired_codes_are_rejected()
    {
        await ResetOfferAsync(launchCount: 0);
        var inactive = await CreateCodeAsync(isActive: false);
        var response = await PostOrderAsync(await LoginAsync(), inactive.Code);
        Assert.Equal("STUDENT_CODE_INACTIVE", await ErrorCodeAsync(response));

        var expired = await CreateCodeAsync();
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
            (await db.StudentCodes.SingleAsync(c => c.Id == expired.Id)).ExpiresAt = DateTime.UtcNow.AddDays(-1);
            await db.SaveChangesAsync();
        }

        response = await PostOrderAsync(await LoginAsync(), expired.Code);
        Assert.Equal("STUDENT_CODE_EXPIRED", await ErrorCodeAsync(response));
    }

    [Fact]
    public async Task Code_with_a_use_limit_stops_after_the_limit()
    {
        await ResetOfferAsync(launchCount: 0);
        var code = await CreateCodeAsync(maxUses: 1);

        var first = await LoginAsync();
        await VerifyPaymentAsync(first, await CreateBundleOrderAsync(first, code.Code));

        var response = await PostOrderAsync(await LoginAsync(), code.Code);
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("STUDENT_CODE_EXHAUSTED", await ErrorCodeAsync(response));
    }

    [Fact]
    public async Task Open_student_checkout_does_not_hold_a_launch_slot()
    {
        await ResetOfferAsync(launchCount: 99);
        var code = await CreateCodeAsync();

        // A student has an unpaid checkout open (₹999 too). It must not block the last launch slot.
        await CreateBundleOrderAsync(await LoginAsync(), code.Code);

        var founder = await LoginAsync();
        var order = await CreateBundleOrderAsync(founder, null);
        Assert.Equal(999m, order.TotalAmount);
        await VerifyPaymentAsync(founder, order);
        Assert.Equal(100, await GetLaunchCountAsync());
    }

    [Fact]
    public async Task Validate_endpoint_returns_the_student_price()
    {
        await ResetOfferAsync(launchCount: 0);
        var code = await CreateCodeAsync();
        var response = await (await LoginAsync()).PostAsJsonAsync(
            "/api/offers/student-code/validate", new { code = code.Code });
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<ValidateStudentCodeResponse>(Json);
        Assert.Equal(999, body!.Price);
        Assert.Equal(365, body.AccessDurationDays);

        var bad = await (await LoginAsync()).PostAsJsonAsync(
            "/api/offers/student-code/validate", new { code = "NOPE1234" });
        Assert.Equal(HttpStatusCode.Conflict, bad.StatusCode);
    }

    [Fact]
    public async Task Admin_lists_students_separately_and_launch_members_exclude_them()
    {
        await ResetOfferAsync(launchCount: 0);
        var code = await CreateCodeAsync();
        var student = await LoginAsync();
        var order = await CreateBundleOrderAsync(student, code.Code);
        await VerifyPaymentAsync(student, order);

        var admin = await AdminAsync();
        var students = await admin.GetFromJsonAsync<AdminStudentMemberListResponse>(
            "/api/admin/student-offers/members", Json);
        var row = Assert.Single(students!.Items, i => i.OrderNumber == OrderNumber(order));
        Assert.Equal(code.Code, row.StudentCode);
        Assert.Equal(999m, row.AmountPaid);

        var launchMembers = await admin.GetFromJsonAsync<AdminFoundingMemberListResponse>(
            $"/api/admin/special-offers/{DatabaseSeeder.Catalog.BundleId}/members", Json);
        Assert.DoesNotContain(launchMembers!.Items, i => i.OrderNumber == OrderNumber(order));

        var summary = await admin.GetFromJsonAsync<AdminStudentOfferResponse>("/api/admin/student-offers", Json);
        Assert.True(summary!.EnrolledCount >= 1);
        Assert.Equal(1, summary.Codes.Single(c => c.Id == code.Id).UsedCount);
    }

    [Fact]
    public async Task Us_student_pays_the_dollar_student_price_without_using_a_launch_slot()
    {
        await ResetOfferAsync(launchCount: 30);
        var code = await CreateCodeAsync();
        var admin = await AdminAsync();
        try
        {
            await SetUsRowAsync(studentPrice: null);

            // Without a dollar student price, US buyers cannot use a code.
            var usStudent = await LoginUsAsync();
            var blocked = await PostOrderAsync(usStudent, code.Code);
            Assert.Equal(HttpStatusCode.Conflict, blocked.StatusCode);
            Assert.Equal("STUDENT_CODE_NOT_AVAILABLE", await ErrorCodeAsync(blocked));

            var save = await admin.PutAsJsonAsync(
                "/api/admin/student-offers/settings", new { studentPrice = 999, studentPriceUsd = 14.99m });
            save.EnsureSuccessStatusCode();
            var summary = await save.Content.ReadFromJsonAsync<AdminStudentOfferResponse>(Json);
            Assert.Equal(14.99m, summary!.StudentPriceUsd);

            var check = await usStudent.PostAsJsonAsync("/api/offers/student-code/validate", new { code = code.Code });
            check.EnsureSuccessStatusCode();
            var checkBody = await check.Content.ReadFromJsonAsync<ValidateStudentCodeResponse>(Json);
            Assert.Equal(14.99m, checkBody!.Price);
            Assert.Equal("USD", checkBody.Currency);

            var order = await CreateBundleOrderAsync(usStudent, code.Code);
            Assert.Equal(14.99m, order.TotalAmount);
            Assert.Equal("USD", order.Currency);
            await VerifyPaymentAsync(usStudent, order);

            Assert.Equal(30, await GetLaunchCountAsync());
            await using var scope = _factory.Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
            Assert.True((await db.LaunchMemberships.SingleAsync(m => m.OrderId == order.OrderId)).IsStudent);

            var after = await admin.GetFromJsonAsync<AdminStudentOfferResponse>("/api/admin/student-offers", Json);
            Assert.True(after!.RevenueUsd >= 14.99m);
        }
        finally
        {
            await SetUsRowAsync(remove: true);
        }
    }

    [Fact]
    public async Task Dollar_student_price_needs_us_pricing_to_be_set_up_first()
    {
        await SetUsRowAsync(remove: true);
        var response = await (await AdminAsync()).PutAsJsonAsync(
            "/api/admin/student-offers/settings", new { studentPrice = 999, studentPriceUsd = 14.99m });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("US_PRICE_REQUIRED", await ErrorCodeAsync(response));
    }

    private async Task<HttpClient> LoginUsAsync()
    {
        var client = await LoginAsync();
        (await client.PatchAsJsonAsync("/api/me/preferences", new { countryCode = "US" })).EnsureSuccessStatusCode();
        return client;
    }

    private async Task SetUsRowAsync(decimal? studentPrice = null, bool remove = false)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
        var row = await db.CoursePrices.SingleOrDefaultAsync(
            p => p.CourseId == DatabaseSeeder.Catalog.BundleId && p.CountryCode == "US");
        if (remove)
        {
            if (row is not null) db.CoursePrices.Remove(row);
        }
        else
        {
            if (row is null)
            {
                row = new VIVI.Core.Entities.CoursePrice
                {
                    Id = Guid.NewGuid(),
                    CourseId = DatabaseSeeder.Catalog.BundleId,
                    CountryCode = "US",
                    Currency = "USD"
                };
                db.CoursePrices.Add(row);
            }
            row.Price = 25m;
            row.Mrp = 30m;
            row.LaunchPrice = 15m;
            row.RegularPriceAfterLaunch = 25m;
            row.StudentPrice = studentPrice;
            row.UpdatedAt = DateTime.UtcNow;
        }
        await db.SaveChangesAsync();
    }

    private string OrderNumber(CreateOrderResponse order)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
        return db.Orders.Single(o => o.Id == order.OrderId).OrderNumber;
    }

    private static string NextPhone() => (8300000000L + Interlocked.Increment(ref PhoneSeq)).ToString();

    private Task<HttpClient> LoginAsync() => AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());

    private async Task<HttpClient> AdminAsync()
    {
        var client = _factory.CreateClient();
        return AuthTests.WithToken(client, await AuthTests.LoginAsync(client));
    }

    private async Task<AdminStudentCodeResponse> CreateCodeAsync(bool isActive = true, int? maxUses = null)
    {
        var admin = await AdminAsync();
        var response = await admin.PostAsJsonAsync("/api/admin/student-offers/codes", new
        {
            label = "Test College",
            isActive,
            maxUses
        });
        response.EnsureSuccessStatusCode();
        var created = (await response.Content.ReadFromJsonAsync<AdminStudentCodeResponse>(Json))!;
        Assert.StartsWith("VIVISTUDENT", created.Code);
        return created;
    }

    private static Task<HttpResponseMessage> PostOrderAsync(HttpClient customer, string? studentCode) =>
        customer.PostAsJsonAsync("/api/orders", new
        {
            studentCode,
            items = new[] { new { itemType = "Course", courseId = DatabaseSeeder.Catalog.BundleId, quantity = 1 } }
        });

    private static async Task<CreateOrderResponse> CreateBundleOrderAsync(HttpClient customer, string? studentCode)
    {
        var response = await PostOrderAsync(customer, studentCode);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<CreateOrderResponse>(Json))!;
    }

    private static async Task<string?> ErrorCodeAsync(HttpResponseMessage response)
    {
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(Json);
        return body.GetProperty("code").GetString();
    }

    private static async Task VerifyPaymentAsync(HttpClient customer, CreateOrderResponse order)
    {
        var paymentId = FakeRazorpayPaymentGateway.BuildTestPaymentId(order.RazorpayOrderId);
        var signature = FakeRazorpayPaymentGateway.BuildTestSignature(order.RazorpayOrderId, paymentId);
        var response = await customer.PostAsJsonAsync("/api/payments/razorpay/verify", new
        {
            internalOrderId = order.OrderId,
            razorpayOrderId = order.RazorpayOrderId,
            razorpayPaymentId = paymentId,
            razorpaySignature = signature
        });
        response.EnsureSuccessStatusCode();
    }

    private async Task<int> GetLaunchCountAsync()
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
        return (await db.LaunchOfferCounters.AsNoTracking()
            .SingleAsync(c => c.CourseId == DatabaseSeeder.Catalog.BundleId)).CompletedPurchaseCount;
    }

    /// <summary>Baseline for each test: launch count set, student price 999, no other unpaid checkouts holding slots.</summary>
    private async Task ResetOfferAsync(int launchCount)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
        var offer = await db.LaunchOfferCounters.SingleAsync(c => c.CourseId == DatabaseSeeder.Catalog.BundleId);
        offer.CompletedPurchaseCount = launchCount;
        offer.StudentPrice = 999;
        offer.ViralProjectCourseId = null;
        offer.AccessDurationDays = 365;
        offer.IsActive = true;
        offer.UpdatedAt = DateTime.UtcNow;

        var expired = DateTime.UtcNow - LaunchOfferService.CheckoutHoldWindow - TimeSpan.FromMinutes(1);
        foreach (var open in await db.Orders
                     .Where(o => o.Status == OrderStatus.PendingPayment && o.CreatedAt > expired).ToListAsync())
            open.CreatedAt = expired;
        await db.SaveChangesAsync();
    }
}
