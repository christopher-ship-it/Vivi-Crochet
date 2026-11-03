using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Xunit;
using VIVI.Api.DTOs.Live;
using VIVI.Infrastructure.Commerce;

namespace VIVI.Api.Tests;

/// <summary>Enquiries taken outside the app: the admin records the student, payment and week, and the class plan is emailed.</summary>
public sealed class LiveEnquiryTests
{
    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter() }
    };

    private static async Task<HttpClient> AdminAsync(ApiFactory factory)
    {
        var admin = factory.CreateClient();
        AuthTests.WithToken(admin, await AuthTests.LoginAsync(admin));
        return admin;
    }

    private static async Task<Guid> CourseIdAsync(ApiFactory factory, string code) =>
        (await factory.CreateClient().GetFromJsonAsync<List<LiveCourseResponse>>("/api/live/courses", Json))!
        .Single(c => c.Code == code).Id;

    private static async Task<Guid> WeekIdAsync(ApiFactory factory, int index) =>
        (await factory.CreateClient().GetFromJsonAsync<List<LiveWeekSummaryResponse>>("/api/live/weeks", Json))!
        .OrderBy(w => w.StartDate).ElementAt(index).Id;

    [Fact]
    public async Task Admin_records_enquiry_and_the_class_plan_is_emailed()
    {
        await using var factory = new ApiFactory();
        var admin = await AdminAsync(factory);
        var emails = factory.GetFakeEmailService();
        emails.Clear();

        var courseId = await CourseIdAsync(factory, "intermediate");
        var weekId = await WeekIdAsync(factory, 6);
        var response = await admin.PostAsJsonAsync("/api/admin/live/enquiries", new
        {
            name = "Meena",
            email = "  Meena.Test@Example.com ",
            phone = "+91 98765 43210",
            courseId,
            weekId,
            slotType = "Morning",
            classTime = "11:00 AM – 1:00 PM",
            paymentReference = "UPI 1234567890"
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = (await response.Content.ReadFromJsonAsync<LiveEnquiryDto>(Json))!;

        Assert.Equal("meena.test@example.com", created.Email);
        Assert.Equal("919876543210", created.Phone);
        Assert.Equal("Intermediate", created.CourseName);
        Assert.Equal(1499m, created.Price);
        Assert.NotNull(created.SentAt);
        // 10-day course: the plan runs for two weeks from the chosen week.
        Assert.Equal(created.StartDate.AddDays(13), created.EndDate);

        var sent = Assert.Single(emails.SentMessages);
        Assert.Equal("meena.test@example.com", sent.To);
        Assert.Contains("Intermediate", sent.Subject);
        Assert.Contains("UPI 1234567890", sent.TextBody);
        Assert.Contains("Morning Crochet Circle", sent.TextBody);
        Assert.Contains("11:00 AM – 1:00 PM", sent.TextBody);
        Assert.Contains("Eastern Time (US)", sent.TextBody);
        Assert.Equal("11:00 AM – 1:00 PM", created.SlotHours);

        var list = await admin.GetFromJsonAsync<List<LiveEnquiryDto>>("/api/admin/live/enquiries", Json);
        Assert.Contains(list!, e => e.Id == created.Id);
    }

    [Fact]
    public async Task Failed_send_keeps_the_enquiry_and_resend_stamps_it()
    {
        await using var factory = new ApiFactory();
        var admin = await AdminAsync(factory);
        var courseId = await CourseIdAsync(factory, "basic");
        var weekId = await WeekIdAsync(factory, 7);

        factory.GetFakeEmailService().Clear();
        var created = (await (await admin.PostAsJsonAsync("/api/admin/live/enquiries", new
        {
            name = "Lakshmi",
            email = "lakshmi.test@example.com",
            courseId,
            weekId,
            slotType = "Evening",
            classTime = "6:00 PM – 8:00 PM",
            paymentReference = "BANK-889"
        })).Content.ReadFromJsonAsync<LiveEnquiryDto>(Json))!;

        Assert.NotNull(created.SentAt);

        var resend = await admin.PostAsync($"/api/admin/live/enquiries/{created.Id}/send", null);
        Assert.Equal(HttpStatusCode.OK, resend.StatusCode);
        Assert.Equal(2, factory.GetFakeEmailService().SentMessages.Count);
    }

    [Fact]
    public async Task Invalid_enquiry_is_rejected_and_nothing_is_saved()
    {
        await using var factory = new ApiFactory();
        var admin = await AdminAsync(factory);
        var courseId = await CourseIdAsync(factory, "basic");
        var weekId = await WeekIdAsync(factory, 8);
        var before = (await admin.GetFromJsonAsync<List<LiveEnquiryDto>>("/api/admin/live/enquiries", Json))!.Count;

        async Task<HttpStatusCode> Post(string email, string reference) =>
            (await admin.PostAsJsonAsync("/api/admin/live/enquiries", new
            {
                name = "Test Student",
                email,
                courseId,
                weekId,
                slotType = "Morning",
                classTime = "10:00 AM – 12:00 PM",
                paymentReference = reference
            })).StatusCode;

        Assert.Equal(HttpStatusCode.BadRequest, await Post("not-an-email", "UPI-1"));
        Assert.Equal(HttpStatusCode.BadRequest, await Post("someone@example.com", "   "));

        var after = (await admin.GetFromJsonAsync<List<LiveEnquiryDto>>("/api/admin/live/enquiries", Json))!.Count;
        Assert.Equal(before, after);
    }

    [Fact]
    public void India_class_time_is_converted_to_us_eastern_time()
    {
        // 2 Nov 2026 is after US daylight saving ends (1 Nov), so Eastern is UTC-5.
        Assert.Equal(
            "11:30 PM – 1:30 AM Eastern Time (US)",
            LiveClassTime.ToUsEastern("10:00 AM – 12:00 PM", new DateOnly(2026, 11, 2)));
        Assert.Equal(
            "9:30 PM – 11:30 PM Eastern Time (US)",
            LiveClassTime.ToUsEastern("08:00 – 10:00", new DateOnly(2026, 11, 2)));
        Assert.Null(LiveClassTime.ToUsEastern("Mon–Fri · late", new DateOnly(2026, 11, 2)));
    }

    [Fact]
    public async Task Customers_cannot_record_enquiries()
    {
        await using var factory = new ApiFactory();
        var customer = await AuthTests.LoginCustomerAsync(factory.CreateClient(), "9876500177");
        var response = await customer.PostAsJsonAsync("/api/admin/live/enquiries", new { });
        Assert.True(response.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.Unauthorized);
    }
}
