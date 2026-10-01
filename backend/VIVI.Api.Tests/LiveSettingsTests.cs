using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
using VIVI.Api.DTOs.Live;
using VIVI.Core.Enums;
using VIVI.Infrastructure.Commerce;

namespace VIVI.Api.Tests;

/// <summary>Admin-editable Live settings: price, timings, language, level, additional sessions.</summary>
public sealed class LiveSettingsTests
{
    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter() }
    };

    private static long _phoneSeq = 7500000000;
    private static string NextPhone() => Interlocked.Increment(ref _phoneSeq).ToString();

    private static async Task<HttpClient> AdminAsync(ApiFactory factory)
    {
        var admin = factory.CreateClient();
        AuthTests.WithToken(admin, await AuthTests.LoginAsync(admin));
        return admin;
    }

    private static UpdateLiveSettingsRequest FromResponse(AdminLiveSettingsResponse s) => new()
    {
        PackagePrice = s.PackagePrice,
        HoursPerClassDay = s.HoursPerClassDay,
        Language = s.Language,
        Level = s.Level,
        Sessions = s.Sessions.ToList()
    };

    private static async Task<AdminLiveSettingsResponse> GetSettingsAsync(HttpClient admin) =>
        (await admin.GetFromJsonAsync<AdminLiveSettingsResponse>("/api/admin/live/settings", Json))!;

    private static async Task<List<LiveWeekSummaryResponse>> WeeksAsync(ApiFactory factory) =>
        (await factory.CreateClient().GetFromJsonAsync<List<LiveWeekSummaryResponse>>("/api/live/weeks", Json))!;

    /// <summary>
    /// A week that has not ended yet: additional-session rows are only created for current and
    /// future weeks (the test season starts in January, so most listed weeks are already past).
    /// </summary>
    private static async Task<Guid> FutureWeekIdAsync(ApiFactory factory, int skip = 0)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        return (await WeeksAsync(factory)).Where(w => w.EndDate >= today).OrderBy(w => w.StartDate).Skip(skip).First().Id;
    }

    private static async Task<CreateLiveBookingResponse> BookAsync(
        HttpClient customer,
        Guid weekId,
        LiveSlotType slotType)
    {
        await AuthTests.EnsureVerifiedEmailAsync(customer);
        var response = await customer.PostAsJsonAsync("/api/live/bookings", new { weekId, slotType = slotType.ToString() });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<CreateLiveBookingResponse>(Json))!;
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

    [Fact]
    public async Task Defaults_come_from_config_with_extra_sessions_off()
    {
        await using var factory = new ApiFactory();
        var admin = await AdminAsync(factory);

        var settings = await GetSettingsAsync(admin);
        Assert.Equal(999m, settings.PackagePrice);
        Assert.Equal(2, settings.HoursPerClassDay);
        Assert.Equal("Tamil", settings.Language);
        Assert.Equal("Basic", settings.Level);
        Assert.Equal(5, settings.Sessions.Count);
        Assert.All(settings.Sessions.Where(s => s.IsCore), s => Assert.True(s.IsEnabled));
        Assert.All(settings.Sessions.Where(s => !s.IsCore), s => Assert.False(s.IsEnabled));

        var weeks = await WeeksAsync(factory);
        Assert.Equal("Tamil", weeks[0].Language);
        Assert.Equal("Basic", weeks[0].Level);
        Assert.Equal(2, weeks[0].Slots.Count);
    }

    [Fact]
    public async Task Admin_changes_flow_to_customers_and_new_bookings_use_the_new_price()
    {
        await using var factory = new ApiFactory();
        var admin = await AdminAsync(factory);
        var weekId = (await WeeksAsync(factory))[3].Id;

        var oldCustomer = await AuthTests.LoginCustomerAsync(factory.CreateClient(), NextPhone());
        var oldBooking = await BookAsync(oldCustomer, weekId, LiveSlotType.Morning);
        Assert.Equal(999m, oldBooking.TotalAmount);
        await PayAsync(oldCustomer, oldBooking);

        var request = FromResponse(await GetSettingsAsync(admin));
        request.PackagePrice = 1499m;
        request.HoursPerClassDay = 1;
        request.Language = "English";
        request.Level = "Intermediate";
        request.Sessions.Single(s => s.SlotType == LiveSlotType.Morning).Hours = "7:00 AM – 8:00 AM";
        var save = await admin.PutAsJsonAsync("/api/admin/live/settings", request, Json);
        Assert.True(save.IsSuccessStatusCode, await save.Content.ReadAsStringAsync());

        var detail = await factory.CreateClient()
            .GetFromJsonAsync<LiveWeekDetailResponse>($"/api/live/weeks/{weekId}", Json);
        Assert.Equal(1499m, detail!.PackagePrice);
        Assert.Equal("English", detail.Language);
        Assert.Equal("Intermediate", detail.Level);
        Assert.Equal(1, detail.HoursPerClassDay);
        Assert.Equal("7:00 AM – 8:00 AM", detail.Slots.Single(s => s.SlotType == "Morning").Hours);

        // The earlier booking keeps the price it was paid at.
        var kept = await oldCustomer.GetFromJsonAsync<LiveBookingResponse>(
            $"/api/live/bookings/{oldBooking.BookingId}", Json);
        Assert.Equal(999m, kept!.PackagePrice);

        var newCustomer = await AuthTests.LoginCustomerAsync(factory.CreateClient(), NextPhone());
        var newBooking = await BookAsync(newCustomer, weekId, LiveSlotType.Evening);
        Assert.Equal(1499m, newBooking.TotalAmount);
        Assert.Equal(149900, newBooking.AmountPaise);
    }

    [Fact]
    public async Task Week_overrides_apply_to_that_week_only_and_can_be_cleared()
    {
        await using var factory = new ApiFactory();
        var admin = await AdminAsync(factory);
        var weeks = await WeeksAsync(factory);
        var target = weeks[5].Id;
        var other = weeks[6].Id;

        var set = await admin.PutAsJsonAsync($"/api/admin/live/weeks/{target}/overrides", new
        {
            priceOverride = 1299m,
            languageOverride = "Hindi",
            levelOverride = "Advanced"
        });
        Assert.Equal(HttpStatusCode.NoContent, set.StatusCode);

        var hours = await admin.PutAsJsonAsync(
            $"/api/admin/live/weeks/{target}/slots/Evening/hours",
            new { hours = "5:00 PM – 6:00 PM" });
        Assert.Equal(HttpStatusCode.NoContent, hours.StatusCode);

        var after = await WeeksAsync(factory);
        var t = after.Single(w => w.Id == target);
        Assert.Equal(1299m, t.PackagePrice);
        Assert.Equal("Hindi", t.Language);
        Assert.Equal("Advanced", t.Level);
        Assert.Equal("5:00 PM – 6:00 PM", t.Slots.Single(s => s.SlotType == "Evening").Hours);

        var o = after.Single(w => w.Id == other);
        Assert.Equal(999m, o.PackagePrice);
        Assert.Equal("Tamil", o.Language);
        Assert.Equal("6:00 PM – 8:00 PM", o.Slots.Single(s => s.SlotType == "Evening").Hours);

        await admin.PutAsJsonAsync($"/api/admin/live/weeks/{target}/overrides", new { });
        await admin.PutAsJsonAsync($"/api/admin/live/weeks/{target}/slots/Evening/hours", new { hours = "" });
        var cleared = (await WeeksAsync(factory)).Single(w => w.Id == target);
        Assert.Equal(999m, cleared.PackagePrice);
        Assert.Equal("Tamil", cleared.Language);
        Assert.Equal("6:00 PM – 8:00 PM", cleared.Slots.Single(s => s.SlotType == "Evening").Hours);
    }

    [Fact]
    public async Task Additional_session_can_be_enabled_booked_and_hidden_again()
    {
        await using var factory = new ApiFactory();
        var admin = await AdminAsync(factory);
        var weekId = await FutureWeekIdAsync(factory);

        var request = FromResponse(await GetSettingsAsync(admin));
        var extra = request.Sessions.Single(s => s.SlotType == LiveSlotType.Extra1);
        extra.IsEnabled = true;
        extra.Name = "Mid-day Crochet Circle";
        extra.Hours = "1:00 PM – 3:00 PM";
        var on = await admin.PutAsJsonAsync("/api/admin/live/settings", request, Json);
        Assert.True(on.IsSuccessStatusCode, await on.Content.ReadAsStringAsync());

        var detail = await factory.CreateClient()
            .GetFromJsonAsync<LiveWeekDetailResponse>($"/api/live/weeks/{weekId}", Json);
        var slot = detail!.Slots.Single(s => s.SlotType == "Extra1");
        Assert.Equal("Mid-day Crochet Circle", slot.Name);
        Assert.Equal("1:00 PM – 3:00 PM", slot.Hours);
        Assert.Equal(4, slot.SeatCapacity);

        var customer = await AuthTests.LoginCustomerAsync(factory.CreateClient(), NextPhone());
        var booking = await BookAsync(customer, weekId, LiveSlotType.Extra1);
        await PayAsync(customer, booking);
        var confirmed = await customer.GetFromJsonAsync<LiveBookingResponse>(
            $"/api/live/bookings/{booking.BookingId}", Json);
        Assert.Equal("Mid-day Crochet Circle", confirmed!.SlotName);

        // Cannot be switched off while it has upcoming bookings.
        var current = FromResponse(await GetSettingsAsync(admin));
        current.Sessions.Single(s => s.SlotType == LiveSlotType.Extra1).IsEnabled = false;
        var blocked = await admin.PutAsJsonAsync("/api/admin/live/settings", current, Json);
        Assert.Equal(HttpStatusCode.Conflict, blocked.StatusCode);
        Assert.Contains("SESSION_HAS_BOOKINGS", await blocked.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Disabled_session_is_hidden_and_cannot_be_booked()
    {
        await using var factory = new ApiFactory();
        var admin = await AdminAsync(factory);
        var weekId = await FutureWeekIdAsync(factory);
        var customer = await AuthTests.LoginCustomerAsync(factory.CreateClient(), NextPhone());
        await AuthTests.EnsureVerifiedEmailAsync(customer);

        // Never enabled: there is no such session for the week.
        var never = await customer.PostAsJsonAsync("/api/live/bookings", new { weekId, slotType = "Extra2" });
        Assert.Equal(HttpStatusCode.NotFound, never.StatusCode);

        // Switched on, then off again: the slot row exists but customers cannot see or book it.
        var on = FromResponse(await GetSettingsAsync(admin));
        on.Sessions.Single(s => s.SlotType == LiveSlotType.Extra2).IsEnabled = true;
        Assert.True((await admin.PutAsJsonAsync("/api/admin/live/settings", on, Json)).IsSuccessStatusCode);
        var shown = await factory.CreateClient()
            .GetFromJsonAsync<LiveWeekDetailResponse>($"/api/live/weeks/{weekId}", Json);
        Assert.Contains(shown!.Slots, s => s.SlotType == "Extra2");

        var off = FromResponse(await GetSettingsAsync(admin));
        off.Sessions.Single(s => s.SlotType == LiveSlotType.Extra2).IsEnabled = false;
        Assert.True((await admin.PutAsJsonAsync("/api/admin/live/settings", off, Json)).IsSuccessStatusCode);

        var detail = await factory.CreateClient()
            .GetFromJsonAsync<LiveWeekDetailResponse>($"/api/live/weeks/{weekId}", Json);
        Assert.DoesNotContain(detail!.Slots, s => s.SlotType == "Extra2");

        var again = await customer.PostAsJsonAsync("/api/live/bookings", new { weekId, slotType = "Extra2" });
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        Assert.Contains("SLOT_NOT_AVAILABLE", await again.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Invalid_settings_are_rejected()
    {
        await using var factory = new ApiFactory();
        var admin = await AdminAsync(factory);
        var good = FromResponse(await GetSettingsAsync(admin));

        async Task<HttpStatusCode> Put(Action<UpdateLiveSettingsRequest> change)
        {
            var copy = FromResponse(await GetSettingsAsync(admin));
            change(copy);
            return (await admin.PutAsJsonAsync("/api/admin/live/settings", copy, Json)).StatusCode;
        }

        Assert.Equal(HttpStatusCode.BadRequest, await Put(r => r.PackagePrice = 0m));
        Assert.Equal(HttpStatusCode.BadRequest, await Put(r => r.PackagePrice = 500000m));
        Assert.Equal(HttpStatusCode.BadRequest, await Put(r => r.HoursPerClassDay = 0));
        Assert.Equal(HttpStatusCode.BadRequest, await Put(r => r.HoursPerClassDay = 9));
        Assert.Equal(HttpStatusCode.BadRequest, await Put(r => r.Language = "  "));
        Assert.Equal(HttpStatusCode.BadRequest, await Put(r => r.Level = new string('x', 41)));
        Assert.Equal(HttpStatusCode.BadRequest, await Put(r => r.Sessions[0].Hours = ""));
        Assert.Equal(HttpStatusCode.Conflict, await Put(r => r.Sessions.Single(s => s.SlotType == LiveSlotType.Morning).IsEnabled = false));

        // Nothing above was saved.
        var after = await GetSettingsAsync(admin);
        Assert.Equal(good.PackagePrice, after.PackagePrice);
        Assert.Equal(good.Language, after.Language);
    }

    [Fact]
    public async Task Customers_cannot_change_settings()
    {
        await using var factory = new ApiFactory();
        var customer = await AuthTests.LoginCustomerAsync(factory.CreateClient(), NextPhone());
        var put = await customer.PutAsJsonAsync("/api/admin/live/settings", new UpdateLiveSettingsRequest(), Json);
        Assert.True(put.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.Unauthorized);
    }
}
