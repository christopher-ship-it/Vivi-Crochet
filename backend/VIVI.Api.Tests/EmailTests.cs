using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
using VIVI.Core.Enums;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Commerce;
using VIVI.Infrastructure.Data;
using VIVI.Infrastructure.Email;

namespace VIVI.Api.Tests;

public sealed class EmailTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public EmailTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Payment_verify_sends_order_and_course_emails()
    {
        var emails = _factory.GetFakeEmailService();
        emails.Clear();

        var (customer, courseId) = await OrderTestsHelper.CustomerWithPublishedCourse(_factory, "9444444444");
        var order = await OrderTestsHelper.CreateCourseOrderAsync(customer, courseId);
        await OrderTestsHelper.VerifyPaymentAsync(customer, order);

        Assert.Contains(emails.SentMessages, m => m.Subject.Contains("order is confirmed", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(emails.SentMessages, m => m.Subject.Contains("course is ready", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task Duplicate_payment_verify_does_not_send_duplicate_emails()
    {
        var emails = _factory.GetFakeEmailService();
        emails.Clear();

        var (customer, courseId) = await OrderTestsHelper.CustomerWithPublishedCourse(_factory, "9555555555");
        var order = await OrderTestsHelper.CreateCourseOrderAsync(customer, courseId);
        await OrderTestsHelper.VerifyPaymentAsync(customer, order);
        var countAfterFirst = emails.SentMessages.Count;

        await OrderTestsHelper.VerifyPaymentAsync(customer, order);
        Assert.Equal(countAfterFirst, emails.SentMessages.Count);

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
        var notifications = await db.EmailNotifications.AsNoTracking().ToListAsync();
        Assert.All(
            notifications.GroupBy(n => n.IdempotencyKey),
            g => Assert.Single(g));
    }

    [Fact]
    public async Task Email_failure_does_not_rollback_payment()
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var failingEmail = new FakeEmailService(isConfigured: true, shouldFail: true);
        var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
        var razorpay = scope.ServiceProvider.GetRequiredService<IRazorpayPaymentGateway>();
        var verifier = scope.ServiceProvider.GetRequiredService<IRazorpaySignatureVerifier>();
        var emails = new TransactionalEmailService(
            db,
            failingEmail,
            Microsoft.Extensions.Logging.Abstractions.NullLogger<TransactionalEmailService>.Instance);
        var fulfillment = new PaymentFulfillmentService(
            db,
            verifier,
            razorpay,
            emails,
            new LaunchOfferService(db),
            new DeliveryEstimateService(),
            new InventoryService(db),
            scope.ServiceProvider.GetRequiredService<LiveBookingService>());

        var (customer, courseId) = await OrderTestsHelper.CustomerWithPublishedCourse(_factory, "9333333333");
        var orderResponse = await OrderTestsHelper.CreateCourseOrderAsync(customer, courseId);
        var customerEntity = await db.Customers.SingleAsync(c => c.PhoneNumber == "9333333333");

        var paymentId = FakeRazorpayPaymentGateway.BuildTestPaymentId(orderResponse.RazorpayOrderId);
        var signature = FakeRazorpayPaymentGateway.BuildTestSignature(orderResponse.RazorpayOrderId, paymentId);

        var result = await fulfillment.VerifyAndFulfillAsync(
            customerEntity.Id,
            new PaymentVerificationInput(orderResponse.OrderId, orderResponse.RazorpayOrderId, paymentId, signature),
            CancellationToken.None);

        Assert.False(result.AlreadyProcessed);
        Assert.Equal(OrderStatus.Confirmed, result.Order.Status);
        Assert.NotEmpty(await db.CourseEnrollments.Where(e => e.OrderId == orderResponse.OrderId).ToListAsync());

        var failed = await db.EmailNotifications
            .Where(n => n.OrderId == orderResponse.OrderId)
            .ToListAsync();
        Assert.NotEmpty(failed);
        Assert.All(failed, n => Assert.Equal(EmailNotificationStatus.Failed, n.Status));
    }

    [Fact]
    public void Fake_email_service_reports_not_configured_when_disabled()
    {
        var service = new FakeEmailService(isConfigured: false);
        Assert.False(service.IsConfigured);
    }
}

internal static class OrderTestsHelper
{
    public static async Task<(HttpClient Customer, Guid CourseId)> CustomerWithPublishedCourse(
        ApiFactory factory,
        string phone = "9876543210")
    {
        var admin = factory.CreateClient();
        AuthTests.WithToken(admin, await AuthTests.LoginAsync(admin));
        var created = await admin.PostAsJsonAsync("/api/courses", new
        {
            name = $"Course {Guid.NewGuid():N}"[..12],
            type = "DigitalCourse",
            price = 299,
            accessDays = 30
        });
        created.EnsureSuccessStatusCode();
        var course = await created.Content.ReadFromJsonAsync<VIVI.Api.DTOs.Courses.CourseResponse>(AuthTests.Json);
        var upload = await admin.PostAsJsonAsync("/api/videos/upload-url", new
        {
            courseId = course!.Id,
            fileName = "lesson.mp4",
            contentType = "video/mp4",
            fileSizeBytes = 1024
        });
        upload.EnsureSuccessStatusCode();
        var video = await upload.Content.ReadFromJsonAsync<VIVI.Api.DTOs.Videos.UploadUrlResponse>(AuthTests.Json);
        await admin.PostAsync($"/api/videos/{video!.VideoId}/upload-complete", null);
        await admin.PostAsync($"/api/videos/{video.VideoId}/publish", null);
        await admin.PostAsync($"/api/courses/{course.Id}/publish", null).ContinueWith(t => t.Result.EnsureSuccessStatusCode());

        var customer = await AuthTests.LoginCustomerAsync(factory.CreateClient(), phone);
        return (customer, course.Id);
    }

    public static async Task<VIVI.Api.DTOs.Orders.CreateOrderResponse> CreateCourseOrderAsync(
        HttpClient customer,
        Guid courseId)
    {
        var response = await customer.PostAsJsonAsync("/api/orders", new
        {
            items = new[] { new { itemType = "Course", courseId, quantity = 1 } }
        });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<VIVI.Api.DTOs.Orders.CreateOrderResponse>(AuthTests.Json))!;
    }

    public static async Task VerifyPaymentAsync(
        HttpClient customer,
        VIVI.Api.DTOs.Orders.CreateOrderResponse order)
    {
        var paymentId = FakeRazorpayPaymentGateway.BuildTestPaymentId(order.RazorpayOrderId);
        var signature = FakeRazorpayPaymentGateway.BuildTestSignature(order.RazorpayOrderId, paymentId);
        var verify = await customer.PostAsJsonAsync("/api/payments/razorpay/verify", new
        {
            internalOrderId = order.OrderId,
            razorpayOrderId = order.RazorpayOrderId,
            razorpayPaymentId = paymentId,
            razorpaySignature = signature
        });
        verify.EnsureSuccessStatusCode();
    }
}
