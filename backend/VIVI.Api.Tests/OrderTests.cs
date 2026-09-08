using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Xunit;
using VIVI.Api.DTOs.Auth;
using VIVI.Api.DTOs.Courses;
using VIVI.Api.DTOs.Enrollments;
using VIVI.Api.DTOs.Orders;
using VIVI.Api.DTOs.Payments;
using VIVI.Api.DTOs.Videos;
using VIVI.Core.Enums;
using VIVI.Infrastructure.Auth;
using VIVI.Infrastructure.Commerce;

namespace VIVI.Api.Tests;

public sealed class OrderTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public OrderTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Customer_can_create_course_order_with_server_price()
    {
        var (customer, courseId) = await CustomerWithPublishedCourse(price: 299);
        var response = await customer.PostAsJsonAsync("/api/orders", new
        {
            items = new[]
            {
                new { itemType = "Course", courseId, quantity = 1 }
            }
        });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<CreateOrderResponse>(Json);
        Assert.NotNull(body);
        Assert.Equal(29900, body!.AmountPaise);
        Assert.Equal(299m, body.TotalAmount);
        Assert.False(string.IsNullOrWhiteSpace(body.RazorpayOrderId));
        Assert.Equal(FakeRazorpayPaymentGateway.TestKeyId, body.RazorpayKeyId);
    }

    [Fact]
    public async Task Unpublished_course_cannot_be_ordered()
    {
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient());
        var admin = _factory.CreateClient();
        AuthTests.WithToken(admin, await AuthTests.LoginAsync(admin));
        var created = await admin.PostAsJsonAsync("/api/courses", new { name = "Draft Only", price = 100 });
        created.EnsureSuccessStatusCode();
        var course = await created.Content.ReadFromJsonAsync<CourseResponse>(Json);

        var response = await customer.PostAsJsonAsync("/api/orders", new
        {
            items = new[] { new { itemType = "Course", courseId = course!.Id, quantity = 1 } }
        });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Course_quantity_must_be_one()
    {
        var (customer, courseId) = await CustomerWithPublishedCourse();
        var response = await customer.PostAsJsonAsync("/api/orders", new
        {
            items = new[] { new { itemType = "Course", courseId, quantity = 2 } }
        });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Payment_verify_creates_enrollment_idempotently()
    {
        var (customer, courseId) = await CustomerWithPublishedCourse(accessDays: 30);
        var order = await CreateCourseOrderAsync(customer, courseId);
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

        var enrollments = await customer.GetFromJsonAsync<List<EnrollmentResponse>>("/api/me/enrollments", Json);
        Assert.Single(enrollments!);
        Assert.Equal(courseId, enrollments![0].CourseId);
        Assert.True(enrollments[0].IsActive);
        Assert.Equal(30, (enrollments[0].AccessExpiryDate - enrollments[0].AccessStartDate).Days);

        var verifyAgain = await customer.PostAsJsonAsync("/api/payments/razorpay/verify", new
        {
            internalOrderId = order.OrderId,
            razorpayOrderId = order.RazorpayOrderId,
            razorpayPaymentId = paymentId,
            razorpaySignature = signature
        });
        verifyAgain.EnsureSuccessStatusCode();
        var againBody = await verifyAgain.Content.ReadFromJsonAsync<RazorpayVerifyResponse>(Json);
        Assert.True(againBody!.AlreadyProcessed);

        enrollments = await customer.GetFromJsonAsync<List<EnrollmentResponse>>("/api/me/enrollments", Json);
        Assert.Single(enrollments!);
    }

    [Fact]
    public async Task Invalid_signature_is_rejected()
    {
        var (customer, courseId) = await CustomerWithPublishedCourse();
        var order = await CreateCourseOrderAsync(customer, courseId);

        var response = await customer.PostAsJsonAsync("/api/payments/razorpay/verify", new
        {
            internalOrderId = order.OrderId,
            razorpayOrderId = order.RazorpayOrderId,
            razorpayPaymentId = "pay_bad",
            razorpaySignature = "bad_signature"
        });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Customer_cannot_read_another_customers_order()
    {
        var (customerA, courseId) = await CustomerWithPublishedCourse(phone: "9111111111");
        var order = await CreateCourseOrderAsync(customerA, courseId);

        var customerB = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), "9222222222");
        var response = await customerB.GetAsync($"/api/orders/{order.OrderId}");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Stream_requires_enrollment_for_non_preview()
    {
        var (customer, courseId) = await CustomerWithPublishedCourse();
        var admin = _factory.CreateClient();
        AuthTests.WithToken(admin, await AuthTests.LoginAsync(admin));
        var videoId = await PublishVideoAsync(admin, courseId);

        var unauth = await _factory.CreateClient().GetAsync($"/api/videos/{videoId}/stream-url");
        Assert.Equal(HttpStatusCode.Unauthorized, unauth.StatusCode);

        var noEnrollment = await customer.GetAsync($"/api/videos/{videoId}/stream-url");
        Assert.Equal(HttpStatusCode.Forbidden, noEnrollment.StatusCode);

        var order = await CreateCourseOrderAsync(customer, courseId);
        var paymentId = FakeRazorpayPaymentGateway.BuildTestPaymentId(order.RazorpayOrderId);
        var signature = FakeRazorpayPaymentGateway.BuildTestSignature(order.RazorpayOrderId, paymentId);
        await customer.PostAsJsonAsync("/api/payments/razorpay/verify", new
        {
            internalOrderId = order.OrderId,
            razorpayOrderId = order.RazorpayOrderId,
            razorpayPaymentId = paymentId,
            razorpaySignature = signature
        }).ContinueWith(t => t.Result.EnsureSuccessStatusCode());

        var stream = await customer.GetAsync($"/api/videos/{videoId}/stream-url");
        stream.EnsureSuccessStatusCode();
    }

    private async Task<(HttpClient Customer, Guid CourseId)> CustomerWithPublishedCourse(
        int price = 299,
        int accessDays = 30,
        string? phone = null)
    {
        var admin = _factory.CreateClient();
        AuthTests.WithToken(admin, await AuthTests.LoginAsync(admin));
        var created = await admin.PostAsJsonAsync("/api/courses", new
        {
            name = $"Course {Guid.NewGuid():N}"[..12],
            type = "DigitalCourse",
            price,
            accessDays
        });
        created.EnsureSuccessStatusCode();
        var course = await created.Content.ReadFromJsonAsync<CourseResponse>(Json);
        await PublishVideoAsync(admin, course!.Id);
        await admin.PostAsync($"/api/courses/{course.Id}/publish", null).ContinueWith(t => t.Result.EnsureSuccessStatusCode());

        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), phone ?? UniquePhone());
        return (customer, course.Id);
    }

    private static int _phones;
    private static string UniquePhone() => (9000000000L + Interlocked.Increment(ref _phones)).ToString();

    private static async Task<CreateOrderResponse> CreateCourseOrderAsync(HttpClient customer, Guid courseId)
    {
        var response = await customer.PostAsJsonAsync("/api/orders", new
        {
            items = new[] { new { itemType = "Course", courseId, quantity = 1 } }
        });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<CreateOrderResponse>(Json))!;
    }

    private static async Task<Guid> PublishVideoAsync(HttpClient admin, Guid courseId)
    {
        var upload = await admin.PostAsJsonAsync("/api/videos/upload-url", new
        {
            courseId,
            fileName = "lesson.mp4",
            contentType = "video/mp4",
            fileSizeBytes = 1024
        });
        upload.EnsureSuccessStatusCode();
        var body = await upload.Content.ReadFromJsonAsync<UploadUrlResponse>(Json);
        await admin.PostAsync($"/api/videos/{body!.VideoId}/upload-complete", null);
        await admin.PostAsync($"/api/videos/{body.VideoId}/publish", null);
        return body.VideoId;
    }

    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter() }
    };
}
