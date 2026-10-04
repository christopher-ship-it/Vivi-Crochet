using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using VIVI.Api.DTOs.Admin;
using VIVI.Core.Entities;
using VIVI.Infrastructure.Data;
using Xunit;

namespace VIVI.Api.Tests;

[Collection("CatalogPricing")]
public sealed class OtpStatsTests
{
    private static int PhoneSeq = 9_000_000;

    private readonly ApiFactory _factory;

    public OtpStatsTests(ApiFactory factory)
    {
        _factory = factory;
        _ = factory.CreateClient();
    }

    private async Task<OtpStatsResponse> StatsAsync()
    {
        var client = _factory.CreateClient();
        AuthTests.WithToken(client, await AuthTests.LoginAsync(client));
        return (await client.GetFromJsonAsync<OtpStatsResponse>("/api/admin/otp-stats", AuthTests.Json))!;
    }

    [Fact]
    public async Task Counts_every_requested_otp_and_how_many_were_used()
    {
        var before = await StatsAsync();
        var phone = (8400000000L + Interlocked.Increment(ref PhoneSeq)).ToString();

        // One code requested and used to sign in, one requested and left unused.
        await AuthTests.LoginCustomerAsync(_factory.CreateClient(), phone);
        var unused = await _factory.CreateClient().PostAsJsonAsync("/api/auth/mobile/otp/request", new { phone });
        unused.EnsureSuccessStatusCode();

        var after = await StatsAsync();
        Assert.Equal(before.TotalAllTime + 2, after.TotalAllTime);
        Assert.Equal(before.VerifiedAllTime + 1, after.VerifiedAllTime);
        Assert.Equal(before.Today + 2, after.Today);
        Assert.Equal(before.VerifiedToday + 1, after.VerifiedToday);
        Assert.Equal(30, after.Daily.Count);
        Assert.Equal(after.Today, after.Daily[^1].Requested);

        // Phones are masked: only the last four digits show.
        var latest = after.Recent[0];
        Assert.EndsWith(phone[^4..], latest.Phone);
        Assert.DoesNotContain(phone[..6], latest.Phone);
        Assert.Equal("Pending", latest.Status);
    }

    [Fact]
    public async Task Includes_otps_requested_before_this_feature_existed()
    {
        var phone = (8400000000L + Interlocked.Increment(ref PhoneSeq)).ToString();
        var before = await StatsAsync();

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
            var old = DateTime.UtcNow.AddDays(-400);
            db.OtpChallenges.Add(new OtpChallenge
            {
                Id = Guid.NewGuid(),
                Phone = phone,
                ProviderSessionId = "old-session",
                CreatedAt = old,
                ExpiresAt = old.AddMinutes(5),
                VerifiedAt = old.AddMinutes(1)
            });
            await db.SaveChangesAsync();
        }

        var after = await StatsAsync();
        Assert.Equal(before.TotalAllTime + 1, after.TotalAllTime);
        Assert.Equal(before.VerifiedAllTime + 1, after.VerifiedAllTime);
        Assert.Equal(before.Last30Days, after.Last30Days);
        Assert.True(after.FirstRequestedAt <= DateTime.UtcNow.AddDays(-399));
    }

    [Fact]
    public async Task History_has_every_day_and_month_and_matches_the_totals()
    {
        var client = _factory.CreateClient();
        AuthTests.WithToken(client, await AuthTests.LoginAsync(client));
        var stats = await StatsAsync();
        var history = (await client.GetFromJsonAsync<OtpHistoryResponse>("/api/admin/otp-stats/history", AuthTests.Json))!;

        Assert.Equal(stats.TotalAllTime, history.Requests.Count);
        Assert.Equal(stats.TotalAllTime, history.Daily.Sum(d => d.Requested));
        Assert.Equal(stats.TotalAllTime, history.Monthly.Sum(m => m.Requested));
        Assert.Equal(stats.VerifiedAllTime, history.Monthly.Sum(m => m.Verified));

        // No gaps: one row per day, and one per month, in order.
        var days = history.Daily.Select(d => DateTime.Parse(d.Date)).ToList();
        for (var i = 1; i < days.Count; i++)
            Assert.Equal(days[i - 1].AddDays(1), days[i]);
        var months = history.Monthly.Select(m => DateTime.Parse(m.Month + "-01")).ToList();
        for (var i = 1; i < months.Count; i++)
            Assert.Equal(months[i - 1].AddMonths(1), months[i]);

        // Phones stay masked in the export.
        Assert.All(history.Requests, r => Assert.StartsWith("••••", r.Phone));
    }

    [Fact]
    public async Task Requires_an_admin_login()
    {
        var response = await _factory.CreateClient().GetAsync("/api/admin/otp-stats");
        Assert.Equal(System.Net.HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
