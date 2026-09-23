using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using VIVI.Api.DTOs.Auth;
using VIVI.Infrastructure.Auth;
using VIVI.Infrastructure.Data;
using VIVI.Infrastructure.Push;
using Xunit;

namespace VIVI.Api.Tests;

public sealed class PushTests : IClassFixture<ApiFactory>
{
    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Converters = { new JsonStringEnumConverter() }
    };

    private readonly ApiFactory _factory;
    private readonly HttpClient _client;

    public PushTests(ApiFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task Push_token_triggers_onboarding_once()
    {
        var token = await SignInCustomerAsync("9111111001", "Push Onboard");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var first = await _client.PostAsJsonAsync("/api/me/push-token", new
        {
            expoPushToken = "ExponentPushToken[test-onboard-1]",
            platform = "android"
        });
        Assert.Equal(HttpStatusCode.NoContent, first.StatusCode);

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
            var customer = await db.Customers.SingleAsync(c => c.PhoneNumber == "9111111001");
            Assert.NotNull(customer.OnboardingPushesSentAt);
            Assert.True(await db.DevicePushTokens.AnyAsync(t =>
                t.CustomerId == customer.Id && t.ExpoPushToken == "ExponentPushToken[test-onboard-1]" && t.IsActive));
        }

        var stampedAt = await GetOnboardingStampAsync("9111111001");

        var second = await _client.PostAsJsonAsync("/api/me/push-token", new
        {
            expoPushToken = "ExponentPushToken[test-onboard-2]",
            platform = "ios"
        });
        Assert.Equal(HttpStatusCode.NoContent, second.StatusCode);

        var stampedAgain = await GetOnboardingStampAsync("9111111001");
        Assert.Equal(stampedAt, stampedAgain);
    }

    [Fact]
    public async Task Weekly_push_respects_seven_day_gate()
    {
        var token = await SignInCustomerAsync("9111111002", "Push Weekly");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var register = await _client.PostAsJsonAsync("/api/me/push-token", new
        {
            expoPushToken = "ExponentPushToken[test-weekly-1]",
            platform = "android"
        });
        Assert.Equal(HttpStatusCode.NoContent, register.StatusCode);

        // Job secret must match appsettings Testing / default empty → unauthorized without config.
        // Configure via factory environment — set header that won't match → 401.
        var unauthorized = await _client.PostAsync("/api/internal/jobs/weekly-push?force=true", null);
        Assert.Equal(HttpStatusCode.Unauthorized, unauthorized.StatusCode);

        await using var scope = _factory.Services.CreateAsyncScope();
        var push = scope.ServiceProvider.GetRequiredService<CustomerPushService>();
        var first = await push.SendWeeklyDigestsAsync(CancellationToken.None, ignoreScheduleWindow: true);
        Assert.True(first >= 1);

        var second = await push.SendWeeklyDigestsAsync(CancellationToken.None, ignoreScheduleWindow: true);
        Assert.Equal(0, second);

        var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
        var customer = await db.Customers.SingleAsync(c => c.PhoneNumber == "9111111002");
        Assert.NotNull(customer.LastWeeklyPushAt);
    }

    [Fact]
    public async Task Otp_verify_marks_new_customer()
    {
        var request = await _client.PostAsJsonAsync("/api/auth/mobile/otp/request", new { phone = "9111111003" });
        request.EnsureSuccessStatusCode();
        var challenge = await request.Content.ReadFromJsonAsync<OtpRequestResponse>(Json);

        var verify = await _client.PostAsJsonAsync("/api/auth/mobile/otp/verify", new
        {
            challengeId = challenge!.ChallengeId,
            code = FakeOtpService.TestCode,
            name = "New Push User"
        });
        verify.EnsureSuccessStatusCode();
        var body = await verify.Content.ReadFromJsonAsync<LoginResponse>(Json);
        Assert.True(body!.IsNewCustomer);
    }

    private async Task<DateTime?> GetOnboardingStampAsync(string phone)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
        var customer = await db.Customers.SingleAsync(c => c.PhoneNumber == phone);
        return customer.OnboardingPushesSentAt;
    }

    private async Task<string> SignInCustomerAsync(string phone, string name)
    {
        var request = await _client.PostAsJsonAsync("/api/auth/mobile/otp/request", new { phone });
        request.EnsureSuccessStatusCode();
        var challenge = await request.Content.ReadFromJsonAsync<OtpRequestResponse>(Json);

        var verify = await _client.PostAsJsonAsync("/api/auth/mobile/otp/verify", new
        {
            challengeId = challenge!.ChallengeId,
            code = FakeOtpService.TestCode,
            name
        });
        verify.EnsureSuccessStatusCode();
        var body = await verify.Content.ReadFromJsonAsync<LoginResponse>(Json);
        return body!.AccessToken;
    }
}
