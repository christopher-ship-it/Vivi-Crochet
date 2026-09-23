using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
using VIVI.Api.DTOs.Live;
using VIVI.Core.Enums;
using VIVI.Infrastructure.Commerce;
using VIVI.Infrastructure.Data;

namespace VIVI.Api.Tests;

public sealed class LiveStudioTests : IClassFixture<ApiFactory>
{
    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter() }
    };

    private static long _phoneSeq = 7000000000;
    private readonly ApiFactory _factory;

    public LiveStudioTests(ApiFactory factory) => _factory = factory;

    private static string NextPhone() => Interlocked.Increment(ref _phoneSeq).ToString();

    [Fact]
    public async Task Season_has_52_weeks_and_two_named_slots_at_999()
    {
        var client = _factory.CreateClient();
        var weeks = await client.GetFromJsonAsync<List<LiveWeekSummaryResponse>>("/api/live/weeks", Json);
        Assert.NotNull(weeks);
        Assert.Equal(52, weeks!.Count);

        var first = weeks[0];
        Assert.Equal(1, first.WeekNumber);
        Assert.Equal(999m, first.PackagePrice);
        Assert.Equal(2, first.Slots.Count);
        Assert.Contains(first.Slots, s => s.Name == "Morning Crochet Circle" && s.SlotType == "Morning");
        Assert.Contains(first.Slots, s => s.Name == "Evening Crochet Circle" && s.SlotType == "Evening");
        Assert.All(first.Slots, s => Assert.Equal(4, s.SeatCapacity));
        Assert.Contains(first.Slots, s => s.SlotType == "Morning" && s.Hours == "10:00 AM – 12:00 PM");
        Assert.Contains(first.Slots, s => s.SlotType == "Evening" && s.Hours == "6:00 PM – 8:00 PM");
    }

    [Fact]
    public async Task Customer_week_list_is_only_current_and_next_week_when_restricted()
    {
        await using var factory = _factory.WithWebHostBuilder(builder =>
            builder.UseSetting("LiveStudio:CustomerSelectableWeekCount", "2"));
        // Unique DB so this host does not share weeks/bookings with the class fixture.
        factory.ClientOptions.HandleCookies = true;

        var client = factory.CreateClient();
        // Force season seed via list
        var weeks = await client.GetFromJsonAsync<List<LiveWeekSummaryResponse>>("/api/live/weeks", Json);
        Assert.NotNull(weeks);
        Assert.InRange(weeks!.Count, 0, 2);

        await using var scope = factory.Services.CreateAsyncScope();
        var calendar = scope.ServiceProvider.GetRequiredService<LiveCalendarService>();
        var expected = calendar.GetCustomerSelectableWeekStarts();
        Assert.Equal(2, expected.Count);
        Assert.All(weeks, w => Assert.Contains(w.StartDate, expected));
        Assert.Equal(expected.Count(d => weeks.Any(w => w.StartDate == d)), weeks.Count);

        if (weeks.Count > 0)
        {
            var admin = factory.CreateClient();
            AuthTests.WithToken(admin, await AuthTests.LoginAsync(admin));
            var all = await admin.GetFromJsonAsync<List<AdminLiveWeekResponse>>("/api/admin/live/weeks", Json);
            Assert.Equal(104, all!.Count); // active season + next season (52 × 2)
        }
    }

    [Fact]
    public async Task Selectable_weeks_skip_current_after_monday_morning_circle_starts()
    {
        await using var factory = _factory.WithWebHostBuilder(builder =>
            builder.UseSetting("LiveStudio:CustomerSelectableWeekCount", "2"));

        await using var scope = factory.Services.CreateAsyncScope();
        var calendar = scope.ServiceProvider.GetRequiredService<LiveCalendarService>();

        // Monday 21 Sept 2026 — Morning Circle at 10:00 AM IST (= 04:30 UTC).
        var monday = new DateOnly(2026, 9, 21);

        var beforeCutoffUtc = new DateTime(2026, 9, 21, 4, 29, 0, DateTimeKind.Utc); // 09:59 IST
        var before = calendar.GetCustomerSelectableWeekStarts(monday, beforeCutoffUtc);
        Assert.Equal(2, before.Count);
        Assert.Equal(monday, before[0]);
        Assert.Equal(monday.AddDays(7), before[1]);
        Assert.True(calendar.IsWeekOpenForNewBookings(monday, beforeCutoffUtc));

        var atCutoffUtc = new DateTime(2026, 9, 21, 4, 30, 0, DateTimeKind.Utc); // 10:00 IST
        var after = calendar.GetCustomerSelectableWeekStarts(monday, atCutoffUtc);
        Assert.Equal(2, after.Count);
        Assert.Equal(monday.AddDays(7), after[0]);
        Assert.Equal(monday.AddDays(14), after[1]);
        Assert.False(calendar.IsWeekOpenForNewBookings(monday, atCutoffUtc));

        // Tuesday afternoon — Week 38 batch closed; window is Week 39 + Week 40.
        var tuesday = new DateOnly(2026, 9, 22);
        var tueUtc = new DateTime(2026, 9, 22, 8, 0, 0, DateTimeKind.Utc);
        var tueStarts = calendar.GetCustomerSelectableWeekStarts(tuesday, tueUtc);
        Assert.Equal(monday.AddDays(7), tueStarts[0]); // 28 Sept (Week 39)
        Assert.Equal(monday.AddDays(14), tueStarts[1]); // 5 Oct (Week 40)

        // Week 39 Monday before 10:00 IST — still open: Week 39 + Week 40.
        var week39 = monday.AddDays(7);
        var week39BeforeUtc = new DateTime(2026, 9, 28, 4, 29, 0, DateTimeKind.Utc); // 09:59 IST
        var week39Open = calendar.GetCustomerSelectableWeekStarts(week39, week39BeforeUtc);
        Assert.Equal(week39, week39Open[0]);
        Assert.Equal(week39.AddDays(7), week39Open[1]);

        // Week 39 Monday at 10:00 IST — block 39; window is Week 40 + Week 41.
        var week39AtCutoffUtc = new DateTime(2026, 9, 28, 4, 30, 0, DateTimeKind.Utc); // 10:00 IST
        var week39Closed = calendar.GetCustomerSelectableWeekStarts(week39, week39AtCutoffUtc);
        Assert.Equal(week39.AddDays(7), week39Closed[0]); // Week 40
        Assert.Equal(week39.AddDays(14), week39Closed[1]); // Week 41
    }

    [Fact]
    public async Task Next_season_is_seeded_and_selectable_after_week_52_closes()
    {
        await using var factory = _factory.WithWebHostBuilder(builder =>
            builder.UseSetting("LiveStudio:CustomerSelectableWeekCount", "2"));

        await using var scope = factory.Services.CreateAsyncScope();
        var calendar = scope.ServiceProvider.GetRequiredService<LiveCalendarService>();
        var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
        await calendar.EnsureSeasonAsync(CancellationToken.None);

        var seasonStart = new DateOnly(2026, 1, 5);
        var week52Monday = seasonStart.AddDays(51 * 7); // 2026-12-28
        var nextSeasonWeek1 = seasonStart.AddDays(52 * 7); // 2027-01-04

        Assert.Equal(52, await db.LiveWeeks.CountAsync(w => w.SeasonYear == 2026));
        Assert.Equal(52, await db.LiveWeeks.CountAsync(w => w.SeasonYear == 2027));
        Assert.True(await db.LiveWeeks.AnyAsync(w => w.StartDate == nextSeasonWeek1 && w.WeekNumber == 1));

        // After Week 52 Monday Morning Circle, customers see next season Week 1 + Week 2.
        var afterCutoffUtc = new DateTime(2026, 12, 28, 4, 30, 0, DateTimeKind.Utc); // 10:00 IST
        var starts = calendar.GetCustomerSelectableWeekStarts(week52Monday, afterCutoffUtc);
        Assert.Equal(2, starts.Count);
        Assert.Equal(nextSeasonWeek1, starts[0]);
        Assert.Equal(nextSeasonWeek1.AddDays(7), starts[1]);

        var admin = factory.CreateClient();
        AuthTests.WithToken(admin, await AuthTests.LoginAsync(admin));
        var all = await admin.GetFromJsonAsync<List<AdminLiveWeekResponse>>("/api/admin/live/weeks", Json);
        Assert.Contains(all!, w => w.SeasonYear == 2027 && w.WeekNumber == 1);
        Assert.Contains(all!, w => w.StartDate == nextSeasonWeek1);
    }

    [Fact]
    public async Task Booking_outside_current_or_next_week_is_rejected_when_restricted()
    {
        await using var factory = _factory.WithWebHostBuilder(builder =>
            builder.UseSetting("LiveStudio:CustomerSelectableWeekCount", "2"));

        var admin = factory.CreateClient();
        AuthTests.WithToken(admin, await AuthTests.LoginAsync(admin));
        var all = await admin.GetFromJsonAsync<List<AdminLiveWeekResponse>>("/api/admin/live/weeks", Json);
        Assert.NotNull(all);
        Assert.True(all!.Count >= 3);

        await using var scope = factory.Services.CreateAsyncScope();
        var cal = scope.ServiceProvider.GetRequiredService<LiveCalendarService>();
        var allowed = cal.GetCustomerSelectableWeekStarts();
        var outside = all.First(w => !allowed.Contains(w.StartDate));

        var customer = await AuthTests.LoginCustomerAsync(factory.CreateClient(), NextPhone());
        await AuthTests.EnsureVerifiedEmailAsync(customer);
        var fail = await customer.PostAsJsonAsync(
            "/api/live/bookings",
            new { weekId = outside.Id, slotType = "Morning" });
        Assert.Equal(HttpStatusCode.Conflict, fail.StatusCode);
    }

    [Fact]
    public async Task Standard_week_has_mon_fri_class_saturday_replacement_sunday_off()
    {
        var client = _factory.CreateClient();
        var weeks = await client.GetFromJsonAsync<List<LiveWeekSummaryResponse>>("/api/live/weeks", Json);
        var detail = await client.GetFromJsonAsync<LiveWeekDetailResponse>($"/api/live/weeks/{weeks![0].Id}", Json);
        Assert.NotNull(detail);
        Assert.Equal(7, detail!.Days.Count);
        Assert.Equal(5, detail.Days.Count(d => d.Kind == "Class"));
        Assert.Contains(detail.Days, d => d.Weekday == "SAT" && d.Kind == "Replacement" && d.Label == "REPLACEMENT");
        Assert.Contains(detail.Days, d => d.Weekday == "SUN" && d.Kind == "Off" && d.Label == "OFF");
        Assert.Equal(10, detail.WeeklyLiveHours);
        Assert.Equal(2, detail.HoursPerClassDay);
        Assert.Equal(DayOfWeek.Monday, detail.StartDate.DayOfWeek);
        Assert.Equal(DayOfWeek.Sunday, detail.EndDate.DayOfWeek);
    }

    [Fact]
    public async Task One_weekday_break_moves_replacement_to_saturday_not_sunday()
    {
        var admin = _factory.CreateClient();
        AuthTests.WithToken(admin, await AuthTests.LoginAsync(admin));
        var weeks = await admin.GetFromJsonAsync<List<LiveWeekSummaryResponse>>("/api/live/weeks", Json);
        var weekId = weeks![2].Id;

        var put = await admin.PutAsJsonAsync($"/api/admin/live/weeks/{weekId}/break", new { breakWeekday = "Wednesday" });
        Assert.Equal(HttpStatusCode.NoContent, put.StatusCode);

        var detail = await admin.GetFromJsonAsync<LiveWeekDetailResponse>($"/api/live/weeks/{weekId}", Json);
        Assert.NotNull(detail);
        Assert.Contains(detail!.Days, d => d.Weekday == "WED" && d.Kind == "Break");
        Assert.Contains(detail.Days, d => d.Weekday == "SAT" && d.Kind == "Replacement");
        Assert.Contains(detail.Days, d => d.Weekday == "SUN" && d.Kind == "Off");
        Assert.Equal(4, detail.Days.Count(d => d.Kind == "Class"));
        Assert.Equal(1, detail.Days.Count(d => d.Kind == "Replacement"));
    }

    [Fact]
    public async Task Sunday_break_is_rejected()
    {
        var admin = _factory.CreateClient();
        AuthTests.WithToken(admin, await AuthTests.LoginAsync(admin));
        var weeks = await admin.GetFromJsonAsync<List<LiveWeekSummaryResponse>>("/api/live/weeks", Json);
        var response = await admin.PutAsJsonAsync(
            $"/api/admin/live/weeks/{weeks![0].Id}/break",
            new { breakWeekday = "Sunday" });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Fully_booked_slot_cannot_be_booked_and_seats_update_after_payment()
    {
        var weekId = (await WeeksAsync())[4].Id;
        for (var i = 0; i < 4; i++)
        {
            var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
            var checkout = await CreateLiveCheckoutAsync(customer, weekId, LiveSlotType.Morning);
            await PayAsync(customer, checkout);
        }

        var availability = await _factory.CreateClient()
            .GetFromJsonAsync<LiveWeekDetailResponse>($"/api/live/weeks/{weekId}/availability", Json);
        var morning = availability!.Slots.Single(s => s.SlotType == "Morning");
        Assert.Equal(0, morning.SeatsRemaining);
        Assert.Equal("FullyBooked", morning.Status);

        var blocked = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        await AuthTests.EnsureVerifiedEmailAsync(blocked);
        var fail = await blocked.PostAsJsonAsync("/api/live/bookings", new { weekId, slotType = "Morning" });
        Assert.Equal(HttpStatusCode.Conflict, fail.StatusCode);
    }

    [Fact]
    public async Task Booking_without_verified_email_is_rejected()
    {
        var weekId = (await WeeksAsync())[6].Id;
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var fail = await customer.PostAsJsonAsync(
            "/api/live/bookings",
            new { weekId, slotType = "Morning" });
        Assert.Equal(HttpStatusCode.Conflict, fail.StatusCode);
        var body = await fail.Content.ReadAsStringAsync();
        Assert.Contains("EMAIL_VERIFICATION_REQUIRED", body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Payment_confirms_booking_at_server_price_999()
    {
        var weekId = (await WeeksAsync())[5].Id;
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var checkout = await CreateLiveCheckoutAsync(customer, weekId, LiveSlotType.Evening);
        Assert.Equal(99900, checkout.AmountPaise);

        await PayAsync(customer, checkout);
        var booking = await customer.GetFromJsonAsync<LiveBookingResponse>($"/api/live/bookings/{checkout.BookingId}", Json);
        Assert.Equal("Confirmed", booking!.Status);
        Assert.Equal(999m, booking.PackagePrice);
        Assert.Equal("Evening Crochet Circle", booking.SlotName);
    }

    [Fact]
    public async Task Duplicate_booking_is_rejected()
    {
        var weekId = (await WeeksAsync())[6].Id;
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var first = await CreateLiveCheckoutAsync(customer, weekId, LiveSlotType.Evening);
        await PayAsync(customer, first);

        var second = await customer.PostAsJsonAsync("/api/live/bookings", new { weekId, slotType = "Evening" });
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
    }

    [Fact]
    public async Task Customer_cannot_read_another_customers_booking()
    {
        var weekId = (await WeeksAsync())[7].Id;
        var a = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var checkout = await CreateLiveCheckoutAsync(a, weekId, LiveSlotType.Morning);
        await PayAsync(a, checkout);

        var b = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var response = await b.GetAsync($"/api/live/bookings/{checkout.BookingId}");
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Live_package_cannot_be_ordered_via_generic_orders_api()
    {
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var weekId = (await WeeksAsync())[0].Id;
        var response = await customer.PostAsJsonAsync("/api/orders", new
        {
            items = new[] { new { itemType = "LivePackage", liveWeekId = weekId, quantity = 1 } }
        });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Concurrent_final_seat_only_one_succeeds()
    {
        var weekId = (await WeeksAsync())[10].Id;

        for (var i = 0; i < 3; i++)
        {
            var c = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
            var co = await CreateLiveCheckoutAsync(c, weekId, LiveSlotType.Morning);
            await PayAsync(c, co);
        }

        var a = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var b = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        await AuthTests.EnsureVerifiedEmailAsync(a);
        await AuthTests.EnsureVerifiedEmailAsync(b);
        var results = await Task.WhenAll(
            a.PostAsJsonAsync("/api/live/bookings", new { weekId, slotType = "Morning" }),
            b.PostAsJsonAsync("/api/live/bookings", new { weekId, slotType = "Morning" }));

        Assert.Equal(1, results.Count(r => r.StatusCode == HttpStatusCode.Created));
        Assert.Equal(1, results.Count(r => r.StatusCode == HttpStatusCode.Conflict));
    }

    [Fact]
    public async Task Pending_reservation_holds_seat_until_released()
    {
        var weekId = (await WeeksAsync())[11].Id;
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        await CreateLiveCheckoutAsync(customer, weekId, LiveSlotType.Evening);

        var held = await _factory.CreateClient()
            .GetFromJsonAsync<LiveWeekDetailResponse>($"/api/live/weeks/{weekId}", Json);
        Assert.Equal(3, held!.Slots.Single(s => s.SlotType == "Evening").SeatsRemaining);
    }

    [Fact]
    public async Task Expired_pending_reservation_releases_seat_without_confirming()
    {
        var weekId = (await WeeksAsync())[12].Id;
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var checkout = await CreateLiveCheckoutAsync(customer, weekId, LiveSlotType.Morning);

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
            var booking = await db.LiveBookings.SingleAsync(b => b.Id == checkout.BookingId);
            Assert.Equal(LiveBookingStatus.PendingPayment, booking.Status);
            booking.ReservationExpiresAt = DateTime.UtcNow.AddMinutes(-1);
            await db.SaveChangesAsync();
        }

        var after = await _factory.CreateClient()
            .GetFromJsonAsync<LiveWeekDetailResponse>($"/api/live/weeks/{weekId}", Json);
        Assert.Equal(4, after!.Slots.Single(s => s.SlotType == "Morning").SeatsRemaining);

        var bookingStatus = await customer.GetFromJsonAsync<LiveBookingResponse>(
            $"/api/live/bookings/{checkout.BookingId}",
            Json);
        Assert.Equal("Expired", bookingStatus!.Status);
    }

    [Fact]
    public async Task Live_confirmation_email_sends_once_after_payment()
    {
        var emails = _factory.GetFakeEmailService();
        emails.Clear();

        var weekId = (await WeeksAsync())[13].Id;
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var checkout = await CreateLiveCheckoutAsync(customer, weekId, LiveSlotType.Evening);
        await PayAsync(customer, checkout);

        Assert.Contains(
            emails.SentMessages,
            m => m.Subject.Contains("live booking is confirmed", StringComparison.OrdinalIgnoreCase));
        var liveCount = emails.SentMessages.Count(m =>
            m.Subject.Contains("live booking is confirmed", StringComparison.OrdinalIgnoreCase));

        await PayAsync(customer, checkout);
        var liveCountAgain = emails.SentMessages.Count(m =>
            m.Subject.Contains("live booking is confirmed", StringComparison.OrdinalIgnoreCase));
        Assert.Equal(liveCount, liveCountAgain);
    }

    [Fact]
    public async Task Admin_lists_bookings_and_filters_by_status()
    {
        var weekId = (await WeeksAsync())[14].Id;
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var checkout = await CreateLiveCheckoutAsync(customer, weekId, LiveSlotType.Morning);
        await PayAsync(customer, checkout);

        var admin = _factory.CreateClient();
        AuthTests.WithToken(admin, await AuthTests.LoginAsync(admin));

        var all = await admin.GetFromJsonAsync<List<AdminLiveBookingListItemResponse>>(
            "/api/admin/live/bookings",
            Json);
        Assert.NotNull(all);
        Assert.Contains(all!, b => b.Id == checkout.BookingId && b.Status == "Confirmed");

        var filtered = await admin.GetFromJsonAsync<List<AdminLiveBookingListItemResponse>>(
            "/api/admin/live/bookings?status=Confirmed&slotType=Morning",
            Json);
        Assert.Contains(filtered!, b => b.Id == checkout.BookingId);
        Assert.DoesNotContain(filtered!, b => b.Status != "Confirmed");
    }

    [Fact]
    public async Task Admin_cannot_cancel_confirmed_booking()
    {
        var weekId = (await WeeksAsync())[15].Id;
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var checkout = await CreateLiveCheckoutAsync(customer, weekId, LiveSlotType.Evening);
        await PayAsync(customer, checkout);

        var before = await _factory.CreateClient()
            .GetFromJsonAsync<LiveWeekDetailResponse>($"/api/live/weeks/{weekId}", Json);
        Assert.Equal(3, before!.Slots.Single(s => s.SlotType == "Evening").SeatsRemaining);

        var admin = _factory.CreateClient();
        AuthTests.WithToken(admin, await AuthTests.LoginAsync(admin));
        var cancel = await admin.PostAsync($"/api/admin/live/bookings/{checkout.BookingId}/cancel", null);
        Assert.Equal(HttpStatusCode.Conflict, cancel.StatusCode);

        var after = await _factory.CreateClient()
            .GetFromJsonAsync<LiveWeekDetailResponse>($"/api/live/weeks/{weekId}", Json);
        Assert.Equal(3, after!.Slots.Single(s => s.SlotType == "Evening").SeatsRemaining);
    }

    [Fact]
    public async Task Admin_can_cancel_pending_payment_hold()
    {
        var weekId = (await WeeksAsync())[17].Id;
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var checkout = await CreateLiveCheckoutAsync(customer, weekId, LiveSlotType.Morning);

        var admin = _factory.CreateClient();
        AuthTests.WithToken(admin, await AuthTests.LoginAsync(admin));
        var cancel = await admin.PostAsync($"/api/admin/live/bookings/{checkout.BookingId}/cancel", null);
        Assert.Equal(HttpStatusCode.OK, cancel.StatusCode);

        var after = await _factory.CreateClient()
            .GetFromJsonAsync<LiveWeekDetailResponse>($"/api/live/weeks/{weekId}", Json);
        Assert.Equal(4, after!.Slots.Single(s => s.SlotType == "Morning").SeatsRemaining);
    }

    [Fact]
    public async Task Admin_cannot_set_capacity_below_booked_seats_or_above_max()
    {
        var weekId = (await WeeksAsync())[16].Id;
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var checkout = await CreateLiveCheckoutAsync(customer, weekId, LiveSlotType.Morning);
        await PayAsync(customer, checkout);

        var admin = _factory.CreateClient();
        AuthTests.WithToken(admin, await AuthTests.LoginAsync(admin));
        var below = await admin.PutAsJsonAsync(
            $"/api/admin/live/weeks/{weekId}/slots/Morning/capacity",
            new { seatCapacity = 0 });
        Assert.Equal(HttpStatusCode.Conflict, below.StatusCode);

        var above = await admin.PutAsJsonAsync(
            $"/api/admin/live/weeks/{weekId}/slots/Morning/capacity",
            new { seatCapacity = 8 });
        Assert.Equal(HttpStatusCode.Conflict, above.StatusCode);

        var ok = await admin.PutAsJsonAsync(
            $"/api/admin/live/weeks/{weekId}/slots/Morning/capacity",
            new { seatCapacity = 4 });
        Assert.Equal(HttpStatusCode.NoContent, ok.StatusCode);

        var weeks = await admin.GetFromJsonAsync<List<AdminLiveWeekResponse>>("/api/admin/live/weeks", Json);
        var week = weeks!.Single(w => w.Id == weekId);
        Assert.Equal(4, week.Slots.Single(s => s.SlotType == "Morning").SeatCapacity);
    }

    [Fact]
    public async Task Admin_can_block_and_unblock_slot_and_customer_cannot_book_blocked()
    {
        var weekId = (await WeeksAsync())[18].Id;
        var admin = _factory.CreateClient();
        AuthTests.WithToken(admin, await AuthTests.LoginAsync(admin));

        var block = await admin.PutAsJsonAsync(
            $"/api/admin/live/weeks/{weekId}/slots/Evening/blocked",
            new { isBlocked = true });
        Assert.Equal(HttpStatusCode.NoContent, block.StatusCode);

        var weeks = await admin.GetFromJsonAsync<List<AdminLiveWeekResponse>>("/api/admin/live/weeks", Json);
        var evening = weeks!.Single(w => w.Id == weekId).Slots.Single(s => s.SlotType == "Evening");
        Assert.True(evening.IsBlocked);
        Assert.Equal("Blocked", evening.Status);
        Assert.Equal(0, evening.SeatsRemaining);

        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        await AuthTests.EnsureVerifiedEmailAsync(customer);
        var fail = await customer.PostAsJsonAsync(
            "/api/live/bookings",
            new { weekId, slotType = "Evening" });
        Assert.Equal(HttpStatusCode.Conflict, fail.StatusCode);

        var unblock = await admin.PutAsJsonAsync(
            $"/api/admin/live/weeks/{weekId}/slots/Evening/blocked",
            new { isBlocked = false });
        Assert.Equal(HttpStatusCode.NoContent, unblock.StatusCode);

        var checkout = await CreateLiveCheckoutAsync(customer, weekId, LiveSlotType.Evening);
        Assert.NotEqual(Guid.Empty, checkout.BookingId);
    }

    private async Task<List<LiveWeekSummaryResponse>> WeeksAsync()
    {
        var weeks = await _factory.CreateClient().GetFromJsonAsync<List<LiveWeekSummaryResponse>>("/api/live/weeks", Json);
        Assert.NotNull(weeks);
        return weeks!;
    }

    private static async Task<CreateLiveBookingResponse> CreateLiveCheckoutAsync(
        HttpClient customer,
        Guid weekId,
        LiveSlotType slotType)
    {
        await AuthTests.EnsureVerifiedEmailAsync(customer);
        var response = await customer.PostAsJsonAsync("/api/live/bookings", new { weekId, slotType = slotType.ToString() });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<CreateLiveBookingResponse>(Json);
        Assert.NotNull(body);
        Assert.Equal(99900, body!.AmountPaise);
        Assert.Equal(999m, body.TotalAmount);
        return body;
    }

    private static async Task PayAsync(HttpClient customer, CreateLiveBookingResponse checkout)
    {
        var paymentId = FakeRazorpayPaymentGateway.BuildTestPaymentId(checkout.RazorpayOrderId);
        var signature = FakeRazorpayPaymentGateway.BuildTestSignature(checkout.RazorpayOrderId, paymentId);
        var verify = await customer.PostAsJsonAsync("/api/payments/razorpay/verify", new
        {
            internalOrderId = checkout.OrderId,
            razorpayOrderId = checkout.RazorpayOrderId,
            razorpayPaymentId = paymentId,
            razorpaySignature = signature
        });
        Assert.True(verify.IsSuccessStatusCode, await verify.Content.ReadAsStringAsync());
    }
}
