using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using VIVI.Api.DTOs.Enrollments;
using VIVI.Api.DTOs.Orders;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Infrastructure.Commerce;
using VIVI.Infrastructure.Data;
using Xunit;

namespace VIVI.Api.Tests;

[Collection("CatalogPricing")]
public sealed class LaunchMembershipTests
{
    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter() }
    };

    private static int PhoneSeq = 5_000_000;

    private readonly ApiFactory _factory;

    public LaunchMembershipTests(ApiFactory factory)
    {
        _factory = factory;
        _ = factory.CreateClient();
    }

    [Fact]
    public async Task Duplicate_webhook_does_not_create_second_membership_or_increment_counter_twice()
    {
        await ResetLaunchCountAsync(0);
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var order = await CreateBundleOrderAsync(customer);

        var paymentId = FakeRazorpayPaymentGateway.BuildTestPaymentId(order.RazorpayOrderId);
        var first = await PostWebhookAsync(order.RazorpayOrderId, paymentId);
        first.EnsureSuccessStatusCode();
        var second = await PostWebhookAsync(order.RazorpayOrderId, paymentId);
        second.EnsureSuccessStatusCode();

        Assert.Equal(1, await GetLaunchCountAsync());

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
        var memberships = await db.LaunchMemberships.Where(m => m.OrderId == order.OrderId).ToListAsync();
        Assert.Single(memberships);
        Assert.Equal(1, memberships[0].MemberNumber);
    }

    [Fact]
    public async Task Founding_membership_grants_enrollment_in_viral_project_course_with_offer_access_duration()
    {
        await ResetLaunchCountAsync(0);
        var viralProjectId = await CreateViralProjectAsync("Rose Crochet Bag");
        await SetViralProjectAsync(viralProjectId);
        await SetAccessDurationDaysAsync(365);

        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var order = await CreateBundleOrderAsync(customer);
        await VerifyPaymentAsync(customer, order);

        var enrollments = await customer.GetFromJsonAsync<List<EnrollmentResponse>>("/api/me/enrollments", Json);
        Assert.NotNull(enrollments);
        var projectEnrollment = enrollments!.SingleOrDefault(e => e.CourseId == viralProjectId);
        Assert.NotNull(projectEnrollment);

        var expectedExpiry = DateTime.UtcNow.AddDays(365);
        Assert.True(Math.Abs((projectEnrollment!.AccessExpiryDate - expectedExpiry).TotalMinutes) < 5);

        var foundationEnrollment = enrollments.Single(e => e.CourseId == DatabaseSeeder.Catalog.FoundationId);
        Assert.True(Math.Abs((foundationEnrollment.AccessExpiryDate - expectedExpiry).TotalMinutes) < 5);

        var membership = await customer.GetFromJsonAsync<MyMembershipDto>("/api/me/membership", Json);
        Assert.NotNull(membership);
        Assert.True(membership!.IsMember);
        Assert.Equal(1, membership.MemberNumber);
        // Founding-member ID: VV- + 4 random letters + the 3-digit member number.
        Assert.Matches("^VV-[A-HJKMNP-Z]{4}-001$", membership.MemberCode);
        Assert.NotNull(membership.ViralProject);
        Assert.Equal(viralProjectId, membership.ViralProject!.Id);
    }

    [Fact]
    public async Task Non_launch_price_bundle_purchase_does_not_create_membership()
    {
        await ResetLaunchCountAsync(100);
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var order = await CreateBundleOrderAsync(customer);
        Assert.Equal(1699m, order.TotalAmount);
        await VerifyPaymentAsync(customer, order);

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
        var memberships = await db.LaunchMemberships.Where(m => m.OrderId == order.OrderId).ToListAsync();
        Assert.Empty(memberships);
    }

    private sealed class MyMembershipDto
    {
        public bool IsMember { get; set; }
        public int? MemberNumber { get; set; }
        public string? MemberCode { get; set; }
        public ViralProjectDto? ViralProject { get; set; }
    }

    private sealed class ViralProjectDto
    {
        public Guid Id { get; set; }
    }

    private static string NextPhone() => (9_000_000_000L + Interlocked.Increment(ref PhoneSeq)).ToString();

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

    private async Task<HttpResponseMessage> PostWebhookAsync(string razorpayOrderId, string razorpayPaymentId)
    {
        var payload = JsonSerializer.Serialize(new
        {
            @event = "payment.captured",
            payload = new
            {
                payment = new
                {
                    entity = new { id = razorpayPaymentId, order_id = razorpayOrderId }
                }
            }
        });

        var client = _factory.CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/payments/razorpay/webhook")
        {
            Content = new StringContent(payload, Encoding.UTF8, "application/json")
        };
        request.Headers.Add("X-Razorpay-Signature", "test_webhook_sig");
        return await client.SendAsync(request);
    }

    private async Task<Guid> CreateViralProjectAsync(string name)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
        var admin = await db.AdminUsers.FirstAsync();
        var now = DateTime.UtcNow;
        var id = Guid.NewGuid();
        db.Courses.Add(new Course
        {
            Id = id,
            Name = name,
            Type = CourseType.ProjectCourse,
            Price = 0,
            AccessDays = 30,
            Status = CourseStatus.Published,
            RenewalPercentage = 50,
            CreatedAt = now,
            UpdatedAt = now,
            CreatedBy = admin.Id
        });
        await db.SaveChangesAsync();
        return id;
    }

    private async Task SetViralProjectAsync(Guid courseId)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
        var offer = await db.LaunchOfferCounters.SingleAsync(c => c.CourseId == DatabaseSeeder.Catalog.BundleId);
        offer.ViralProjectCourseId = courseId;
        offer.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
    }

    private async Task SetAccessDurationDaysAsync(int days)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
        var offer = await db.LaunchOfferCounters.SingleAsync(c => c.CourseId == DatabaseSeeder.Catalog.BundleId);
        offer.AccessDurationDays = days;
        offer.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
    }

    private async Task ResetLaunchCountAsync(int count)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
        var offer = await db.LaunchOfferCounters
            .SingleAsync(c => c.CourseId == DatabaseSeeder.Catalog.BundleId);
        offer.CompletedPurchaseCount = count;
        offer.ViralProjectCourseId = null;
        offer.AccessDurationDays = 365;
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
