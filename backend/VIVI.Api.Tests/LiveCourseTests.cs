using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Xunit;
using VIVI.Api.DTOs.Live;
using VIVI.Infrastructure.Commerce;

namespace VIVI.Api.Tests;

/// <summary>Live courses: the Basic / Intermediate / Advanced catalog, the Artist pack and multi-week seat holds.</summary>
public sealed class LiveCourseTests
{
    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter() }
    };

    private static long _phoneSeq = 7600000000;
    private static string NextPhone() => Interlocked.Increment(ref _phoneSeq).ToString();

    private static async Task<HttpClient> AdminAsync(ApiFactory factory)
    {
        var admin = factory.CreateClient();
        AuthTests.WithToken(admin, await AuthTests.LoginAsync(admin));
        return admin;
    }

    private static async Task<List<LiveCourseResponse>> CoursesAsync(ApiFactory factory) =>
        (await factory.CreateClient().GetFromJsonAsync<List<LiveCourseResponse>>("/api/live/courses", Json))!;

    private static async Task<LiveCourseResponse> CourseAsync(ApiFactory factory, string code) =>
        (await CoursesAsync(factory)).Single(c => c.Code == code);

    private static async Task<List<LiveWeekSummaryResponse>> WeeksAsync(ApiFactory factory, Guid? courseId = null) =>
        (await factory.CreateClient().GetFromJsonAsync<List<LiveWeekSummaryResponse>>(
            courseId is null ? "/api/live/weeks" : $"/api/live/weeks?courseId={courseId}", Json))!;

    private static async Task<HttpResponseMessage> BookRawAsync(
        HttpClient customer,
        Guid weekId,
        string slotType,
        Guid? courseId)
    {
        await AuthTests.EnsureVerifiedEmailAsync(customer);
        return await customer.PostAsJsonAsync("/api/live/bookings", new { weekId, slotType, courseId });
    }

    private static async Task<CreateLiveBookingResponse> BookAsync(
        HttpClient customer,
        Guid weekId,
        string slotType,
        Guid? courseId)
    {
        var response = await BookRawAsync(customer, weekId, slotType, courseId);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<CreateLiveBookingResponse>(Json))!;
    }

    private static int Booked(IEnumerable<LiveWeekSummaryResponse> weeks, Guid weekId, string slotType) =>
        weeks.Single(w => w.Id == weekId).Slots.Single(s => s.SlotType == slotType).SeatsBooked;

    [Fact]
    public async Task Courses_are_seeded_in_order_with_the_poster_content()
    {
        await using var factory = new ApiFactory();

        var courses = await CoursesAsync(factory);
        Assert.Equal(new[] { "basic", "intermediate", "advanced", "artist-pack" }, courses.Select(c => c.Code));
        Assert.Equal(new[] { 999m, 1499m, 2499m, 4499m }, courses.Select(c => c.Price));
        // The Artist pack shows 4999 struck through (10% off); single courses have no discount.
        Assert.Equal(new decimal?[] { null, null, null, 4999m }, courses.Select(c => c.Mrp));
        Assert.Equal(new[] { 5, 10, 10, 25 }, courses.Select(c => c.DurationDays));
        Assert.Equal(new[] { 1, 2, 2, 5 }, courses.Select(c => c.WeeksSpan));
        Assert.Equal(new[] { 2, 1, 1 }, courses.Take(3).Select(c => c.HoursPerDay));
        Assert.True(courses[3].IsBundle);
        Assert.All(courses.Take(3), c => Assert.False(c.IsBundle));
        Assert.Equal(5, courses[0].Projects.Count);
        Assert.Equal(5, courses[1].Projects.Count);
        Assert.Equal(5, courses[2].Projects.Count);
        Assert.Equal(7, courses[2].Learn.Count);
        Assert.Contains("Coin pouch (no zip)", courses[0].Projects.Select(p => p.Name));
    }

    [Fact]
    public async Task Basic_course_books_one_week_at_the_course_price()
    {
        await using var factory = new ApiFactory();
        var basic = await CourseAsync(factory, "basic");
        var weeks = await WeeksAsync(factory);
        var customer = await AuthTests.LoginCustomerAsync(factory.CreateClient(), NextPhone());

        var checkout = await BookAsync(customer, weeks[2].Id, "Morning", basic.Id);

        Assert.Equal(999m, checkout.TotalAmount);
        Assert.Equal("Basic", checkout.CourseName);
        Assert.Equal(1, checkout.WeeksHeld);
        Assert.Equal(weeks[2].EndDate, checkout.EndDate);
    }

    [Fact]
    public async Task Intermediate_course_holds_a_seat_in_two_weeks_in_a_row()
    {
        await using var factory = new ApiFactory();
        var course = await CourseAsync(factory, "intermediate");
        var weeks = await WeeksAsync(factory);
        var customer = await AuthTests.LoginCustomerAsync(factory.CreateClient(), NextPhone());

        var checkout = await BookAsync(customer, weeks[10].Id, "Morning", course.Id);

        Assert.Equal(1499m, checkout.TotalAmount);
        Assert.Equal(149900, checkout.AmountPaise);
        Assert.Equal(2, checkout.WeeksHeld);
        Assert.Equal(weeks[11].EndDate, checkout.EndDate);

        var after = await WeeksAsync(factory);
        Assert.Equal(1, Booked(after, weeks[10].Id, "Morning"));
        Assert.Equal(1, Booked(after, weeks[11].Id, "Morning"));
        Assert.Equal(0, Booked(after, weeks[12].Id, "Morning"));
        Assert.Equal(0, Booked(after, weeks[10].Id, "Evening"));

        // The course view shows the fewest seats left across both weeks.
        var courseView = await WeeksAsync(factory, course.Id);
        Assert.Equal(3, courseView.Single(w => w.Id == weeks[10].Id).Slots.Single(s => s.SlotType == "Morning").SeatsRemaining);
        Assert.Equal(1499m, courseView[0].PackagePrice);

        // The second week of the course is already taken in the same circle.
        var overlap = await BookRawAsync(customer, weeks[11].Id, "Morning", course.Id);
        Assert.Equal(HttpStatusCode.Conflict, overlap.StatusCode);
        Assert.Contains("ALREADY_BOOKED", await overlap.Content.ReadAsStringAsync());

        var paymentId = FakeRazorpayPaymentGateway.BuildTestPaymentId(checkout.RazorpayOrderId);
        var verify = await customer.PostAsJsonAsync("/api/payments/razorpay/verify", new
        {
            internalOrderId = checkout.OrderId,
            razorpayOrderId = checkout.RazorpayOrderId,
            razorpayPaymentId = paymentId,
            razorpaySignature = FakeRazorpayPaymentGateway.BuildTestSignature(checkout.RazorpayOrderId, paymentId)
        });
        Assert.True(verify.IsSuccessStatusCode, await verify.Content.ReadAsStringAsync());

        var booking = await customer.GetFromJsonAsync<LiveBookingResponse>($"/api/live/bookings/{checkout.BookingId}", Json);
        Assert.Equal("Confirmed", booking!.Status);
        Assert.Equal("Intermediate", booking.CourseName);
        Assert.Equal(2, booking.WeeksHeld);
        Assert.Equal(weeks[11].EndDate, booking.EndDate);
        Assert.Equal(1499m, booking.PackagePrice);
    }

    [Fact]
    public async Task Artist_pack_holds_five_weeks_and_cancelling_the_hold_frees_every_week()
    {
        await using var factory = new ApiFactory();
        var admin = await AdminAsync(factory);
        var pack = await CourseAsync(factory, "artist-pack");
        var weeks = await WeeksAsync(factory);
        var customer = await AuthTests.LoginCustomerAsync(factory.CreateClient(), NextPhone());

        var checkout = await BookAsync(customer, weeks[20].Id, "Evening", pack.Id);

        Assert.Equal(4499m, checkout.TotalAmount);
        Assert.Equal(449900, checkout.AmountPaise);
        Assert.Equal(5, checkout.WeeksHeld);
        Assert.Equal(weeks[24].EndDate, checkout.EndDate);

        var held = await WeeksAsync(factory);
        for (var i = 20; i <= 24; i++)
            Assert.Equal(1, Booked(held, weeks[i].Id, "Evening"));
        Assert.Equal(0, Booked(held, weeks[25].Id, "Evening"));

        var cancel = await admin.PostAsync($"/api/admin/live/bookings/{checkout.BookingId}/cancel", null);
        Assert.True(cancel.IsSuccessStatusCode, await cancel.Content.ReadAsStringAsync());

        var freed = await WeeksAsync(factory);
        for (var i = 20; i <= 24; i++)
            Assert.Equal(0, Booked(freed, weeks[i].Id, "Evening"));
    }

    [Fact]
    public async Task A_blocked_week_inside_a_course_makes_the_start_week_unavailable()
    {
        await using var factory = new ApiFactory();
        var admin = await AdminAsync(factory);
        var course = await CourseAsync(factory, "advanced");
        var weeks = await WeeksAsync(factory);
        var customer = await AuthTests.LoginCustomerAsync(factory.CreateClient(), NextPhone());

        var block = await admin.PutAsJsonAsync(
            $"/api/admin/live/weeks/{weeks[31].Id}/slots/Morning/blocked",
            new { isBlocked = true });
        Assert.Equal(HttpStatusCode.NoContent, block.StatusCode);

        var plain = await WeeksAsync(factory);
        Assert.Equal("Available", plain.Single(w => w.Id == weeks[30].Id).Slots.Single(s => s.SlotType == "Morning").Status);

        var courseView = await WeeksAsync(factory, course.Id);
        var morning = courseView.Single(w => w.Id == weeks[30].Id).Slots.Single(s => s.SlotType == "Morning");
        Assert.Equal("Blocked", morning.Status);
        Assert.Equal(0, morning.SeatsRemaining);
        Assert.Equal("Available", courseView.Single(w => w.Id == weeks[30].Id).Slots.Single(s => s.SlotType == "Evening").Status);

        var fail = await BookRawAsync(customer, weeks[30].Id, "Morning", course.Id);
        Assert.Equal(HttpStatusCode.Conflict, fail.StatusCode);
        Assert.Contains("SLOT_BLOCKED", await fail.Content.ReadAsStringAsync());

        // Nothing was held in the first week by the failed attempt.
        Assert.Equal(0, Booked(await WeeksAsync(factory), weeks[30].Id, "Morning"));
    }

    [Fact]
    public async Task Admin_edits_flow_to_customers_and_inactive_courses_cannot_be_booked()
    {
        await using var factory = new ApiFactory();
        var admin = await AdminAsync(factory);
        var weeks = await WeeksAsync(factory);
        var customer = await AuthTests.LoginCustomerAsync(factory.CreateClient(), NextPhone());

        var all = (await admin.GetFromJsonAsync<List<LiveCourseResponse>>("/api/admin/live/courses", Json))!;
        Assert.Equal(4, all.Count);

        UpdateLiveCourseRequest Edit(LiveCourseResponse c) => new()
        {
            Name = c.Name,
            Level = c.Level,
            Tagline = c.Tagline,
            Price = c.Price,
            Mrp = c.Mrp,
            DurationDays = c.DurationDays,
            HoursPerDay = c.HoursPerDay,
            WeeksSpan = c.WeeksSpan,
            IsActive = c.IsActive,
            Learn = c.Learn.ToList(),
            Projects = c.Projects.ToList()
        };

        var basic = all.Single(c => c.Code == "basic");
        var change = Edit(basic);
        change.Price = 1099m;
        change.Learn.Add("Reading patterns");
        change.Projects[0].ImageUrl = "https://example.com/flower.jpg";
        var save = await admin.PutAsJsonAsync($"/api/admin/live/courses/{basic.Id}", change, Json);
        Assert.True(save.IsSuccessStatusCode, await save.Content.ReadAsStringAsync());

        var seen = await CourseAsync(factory, "basic");
        Assert.Equal(1099m, seen.Price);
        Assert.Null(seen.Mrp);
        Assert.Equal(6, seen.Learn.Count);
        Assert.Equal("https://example.com/flower.jpg", seen.Projects[0].ImageUrl);
        Assert.Equal(1099m, (await BookAsync(customer, weeks[4].Id, "Morning", basic.Id)).TotalAmount);

        // Invalid edits are rejected and change nothing.
        var bad = Edit(basic);
        bad.Price = 0m;
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync($"/api/admin/live/courses/{basic.Id}", bad, Json)).StatusCode);
        bad = Edit(basic);
        bad.Projects[0].ImageUrl = "javascript:alert(1)";
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync($"/api/admin/live/courses/{basic.Id}", bad, Json)).StatusCode);
        bad = Edit(basic);
        bad.Mrp = 900m; // original price must be above the price
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync($"/api/admin/live/courses/{basic.Id}", bad, Json)).StatusCode);
        bad = Edit(basic);
        bad.WeeksSpan = 0;
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync($"/api/admin/live/courses/{basic.Id}", bad, Json)).StatusCode);
        Assert.Equal(1099m, (await CourseAsync(factory, "basic")).Price);

        // Switched off: hidden from customers and not bookable.
        var advanced = all.Single(c => c.Code == "advanced");
        var off = Edit(advanced);
        off.IsActive = false;
        Assert.True((await admin.PutAsJsonAsync($"/api/admin/live/courses/{advanced.Id}", off, Json)).IsSuccessStatusCode);
        Assert.DoesNotContain(await CoursesAsync(factory), c => c.Code == "advanced");

        var blocked = await BookRawAsync(customer, weeks[8].Id, "Evening", advanced.Id);
        Assert.Equal(HttpStatusCode.Conflict, blocked.StatusCode);
        Assert.Contains("COURSE_NOT_AVAILABLE", await blocked.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Enquiry_whatsapp_number_is_admin_editable_and_public()
    {
        await using var factory = new ApiFactory();
        var admin = await AdminAsync(factory);

        var start = await factory.CreateClient().GetFromJsonAsync<LiveEnquiryResponse>("/api/live/enquiry", Json);
        Assert.Equal("918438034181", start!.WhatsAppNumber);

        async Task<HttpResponseMessage> Save(string number)
        {
            var settings = (await admin.GetFromJsonAsync<AdminLiveSettingsResponse>("/api/admin/live/settings", Json))!;
            return await admin.PutAsJsonAsync("/api/admin/live/settings", new UpdateLiveSettingsRequest
            {
                PackagePrice = settings.PackagePrice,
                HoursPerClassDay = settings.HoursPerClassDay,
                Language = settings.Language,
                Level = settings.Level,
                EnquiryWhatsApp = number,
                Sessions = settings.Sessions.ToList()
            }, Json);
        }

        // Spaces, plus signs and dashes are tidied away.
        Assert.True((await Save("+91 98765-43210")).IsSuccessStatusCode);
        var saved = await factory.CreateClient().GetFromJsonAsync<LiveEnquiryResponse>("/api/live/enquiry", Json);
        Assert.Equal("919876543210", saved!.WhatsAppNumber);

        Assert.Equal(HttpStatusCode.BadRequest, (await Save("12345")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Save("1234567890123456")).StatusCode);

        // Empty switches the button off.
        Assert.True((await Save("")).IsSuccessStatusCode);
        var off = await factory.CreateClient().GetFromJsonAsync<LiveEnquiryResponse>("/api/live/enquiry", Json);
        Assert.Equal(string.Empty, off!.WhatsAppNumber);
    }

    [Fact]
    public async Task Customers_cannot_edit_courses()
    {
        await using var factory = new ApiFactory();
        var course = await CourseAsync(factory, "basic");
        var customer = await AuthTests.LoginCustomerAsync(factory.CreateClient(), NextPhone());

        var put = await customer.PutAsJsonAsync($"/api/admin/live/courses/{course.Id}", new UpdateLiveCourseRequest(), Json);
        Assert.True(put.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Unknown_course_is_not_found()
    {
        await using var factory = new ApiFactory();
        var weeks = await WeeksAsync(factory);
        var customer = await AuthTests.LoginCustomerAsync(factory.CreateClient(), NextPhone());

        var response = await BookRawAsync(customer, weeks[1].Id, "Morning", Guid.NewGuid());
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
