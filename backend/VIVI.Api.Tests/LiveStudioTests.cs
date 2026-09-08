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
        Assert.All(first.Slots, s => Assert.Equal(5, s.SeatCapacity));
    }

    [Fact]
    public async Task Standard_week_has_mon_fri_class_and_sunday_off()
    {
        var client = _factory.CreateClient();
        var weeks = await client.GetFromJsonAsync<List<LiveWeekSummaryResponse>>("/api/live/weeks", Json);
        var detail = await client.GetFromJsonAsync<LiveWeekDetailResponse>($"/api/live/weeks/{weeks![0].Id}", Json);
        Assert.NotNull(detail);
        Assert.Equal(7, detail!.Days.Count);
        Assert.Equal(5, detail.Days.Count(d => d.Kind == "Class"));
        Assert.Contains(detail.Days, d => d.Weekday == "SUN" && d.Kind == "Off" && d.Label == "OFF");
        Assert.DoesNotContain(detail.Days, d => d.Kind == "Replacement");
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
        Assert.Equal(5, detail.Days.Count(d => d.Kind is "Class" or "Replacement"));
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
        for (var i = 0; i < 5; i++)
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
        var fail = await blocked.PostAsJsonAsync("/api/live/bookings", new { weekId, slotType = "Morning" });
        Assert.Equal(HttpStatusCode.Conflict, fail.StatusCode);
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

        for (var i = 0; i < 4; i++)
        {
            var c = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
            var co = await CreateLiveCheckoutAsync(c, weekId, LiveSlotType.Morning);
            await PayAsync(c, co);
        }

        var a = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var b = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
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
        Assert.Equal(4, held!.Slots.Single(s => s.SlotType == "Evening").SeatsRemaining);
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
        Assert.Equal(5, after!.Slots.Single(s => s.SlotType == "Morning").SeatsRemaining);

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
    public async Task Admin_cancel_confirmed_booking_releases_seat()
    {
        var weekId = (await WeeksAsync())[15].Id;
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var checkout = await CreateLiveCheckoutAsync(customer, weekId, LiveSlotType.Evening);
        await PayAsync(customer, checkout);

        var before = await _factory.CreateClient()
            .GetFromJsonAsync<LiveWeekDetailResponse>($"/api/live/weeks/{weekId}", Json);
        Assert.Equal(4, before!.Slots.Single(s => s.SlotType == "Evening").SeatsRemaining);

        var admin = _factory.CreateClient();
        AuthTests.WithToken(admin, await AuthTests.LoginAsync(admin));
        var cancel = await admin.PostAsync($"/api/admin/live/bookings/{checkout.BookingId}/cancel", null);
        Assert.Equal(HttpStatusCode.OK, cancel.StatusCode);
        var detail = await cancel.Content.ReadFromJsonAsync<AdminLiveBookingDetailResponse>(Json);
        Assert.Equal("Cancelled", detail!.Status);

        var after = await _factory.CreateClient()
            .GetFromJsonAsync<LiveWeekDetailResponse>($"/api/live/weeks/{weekId}", Json);
        Assert.Equal(5, after!.Slots.Single(s => s.SlotType == "Evening").SeatsRemaining);
    }

    [Fact]
    public async Task Admin_cannot_set_capacity_below_booked_seats()
    {
        var weekId = (await WeeksAsync())[16].Id;
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var checkout = await CreateLiveCheckoutAsync(customer, weekId, LiveSlotType.Morning);
        await PayAsync(customer, checkout);

        var admin = _factory.CreateClient();
        AuthTests.WithToken(admin, await AuthTests.LoginAsync(admin));
        var response = await admin.PutAsJsonAsync(
            $"/api/admin/live/weeks/{weekId}/slots/Morning/capacity",
            new { seatCapacity = 0 });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);

        var ok = await admin.PutAsJsonAsync(
            $"/api/admin/live/weeks/{weekId}/slots/Morning/capacity",
            new { seatCapacity = 8 });
        Assert.Equal(HttpStatusCode.NoContent, ok.StatusCode);

        var weeks = await admin.GetFromJsonAsync<List<AdminLiveWeekResponse>>("/api/admin/live/weeks", Json);
        var week = weeks!.Single(w => w.Id == weekId);
        Assert.Equal(8, week.Slots.Single(s => s.SlotType == "Morning").SeatCapacity);
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
