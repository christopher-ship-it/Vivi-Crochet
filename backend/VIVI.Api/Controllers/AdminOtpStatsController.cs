using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VIVI.Api.Auth;
using VIVI.Api.DTOs.Admin;
using VIVI.Infrastructure.Data;

namespace VIVI.Api.Controllers;

/// <summary>How many sign-in OTPs the app has generated. Every request is stored, so this includes all past ones.</summary>
[ApiController]
[Route("api/admin/otp-stats")]
[Authorize(Roles = AuthRoles.Console)]
public sealed class AdminOtpStatsController : ControllerBase
{
    private const int DaysShown = 30;
    private static readonly TimeSpan IndiaOffset = TimeSpan.FromHours(5.5);

    private readonly ViviDbContext _db;

    public AdminOtpStatsController(ViviDbContext db) => _db = db;

    [HttpGet]
    [ProducesResponseType(typeof(OtpStatsResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<OtpStatsResponse>> Get(CancellationToken cancellationToken)
    {
        var otps = _db.OtpChallenges.AsNoTracking();

        // Days are counted on the India calendar, since that is where the team reads them.
        var nowUtc = DateTime.UtcNow;
        var todayIndia = (nowUtc + IndiaOffset).Date;
        var firstDayIndia = todayIndia.AddDays(-(DaysShown - 1));
        var windowStartUtc = firstDayIndia - IndiaOffset;

        var total = await otps.CountAsync(cancellationToken);
        var verifiedTotal = await otps.CountAsync(o => o.VerifiedAt != null, cancellationToken);
        var first = total == 0 ? (DateTime?)null : await otps.MinAsync(o => o.CreatedAt, cancellationToken);

        var window = await otps
            .Where(o => o.CreatedAt >= windowStartUtc)
            .OrderByDescending(o => o.CreatedAt)
            .Select(o => new { o.CreatedAt, o.Phone, o.VerifiedAt, o.ExpiresAt, o.AttemptCount })
            .ToListAsync(cancellationToken);

        DateTime DayOf(DateTime utc) => (utc + IndiaOffset).Date;

        var daily = Enumerable.Range(0, DaysShown)
            .Select(i => firstDayIndia.AddDays(i))
            .Select(day => new OtpDayCount
            {
                Date = day.ToString("yyyy-MM-dd"),
                Requested = window.Count(o => DayOf(o.CreatedAt) == day),
                Verified = window.Count(o => DayOf(o.CreatedAt) == day && o.VerifiedAt != null)
            })
            .ToList();

        var last7Start = todayIndia.AddDays(-6);
        var inLast7 = window.Where(o => DayOf(o.CreatedAt) >= last7Start).ToList();
        var inToday = window.Where(o => DayOf(o.CreatedAt) == todayIndia).ToList();

        var topPhones = inLast7
            .GroupBy(o => o.Phone)
            .Select(g => new OtpPhoneCount
            {
                Phone = Mask(g.Key),
                Requests = g.Count(),
                Verified = g.Count(o => o.VerifiedAt != null)
            })
            .OrderByDescending(p => p.Requests)
            .Take(10)
            .ToList();

        var recent = window
            .Take(25)
            .Select(o => new OtpRecentRequest
            {
                RequestedAt = o.CreatedAt,
                Phone = Mask(o.Phone),
                Status = o.VerifiedAt != null ? "Verified" : o.ExpiresAt > nowUtc ? "Pending" : "Expired",
                Attempts = o.AttemptCount
            })
            .ToList();

        return Ok(new OtpStatsResponse
        {
            TotalAllTime = total,
            VerifiedAllTime = verifiedTotal,
            FirstRequestedAt = first,
            Today = inToday.Count,
            Last7Days = inLast7.Count,
            Last30Days = window.Count,
            VerifiedToday = inToday.Count(o => o.VerifiedAt != null),
            VerifiedLast7Days = inLast7.Count(o => o.VerifiedAt != null),
            VerifiedLast30Days = window.Count(o => o.VerifiedAt != null),
            UniquePhonesLast30Days = window.Select(o => o.Phone).Distinct().Count(),
            Daily = daily,
            TopPhonesLast7Days = topPhones,
            Recent = recent
        });
    }

    private static string Mask(string phone)
        => phone.Length <= 4 ? phone : new string('•', phone.Length - 4) + phone[^4..];
}
