using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VIVI.Api.Auth;
using VIVI.Api.DTOs.Admin;
using VIVI.Core.Enums;
using VIVI.Infrastructure.Data;

namespace VIVI.Api.Controllers;

/// <summary>Daily sign-ups / active users plus how many customers are on each kind of paid access.</summary>
[ApiController]
[Route("api/admin/user-metrics")]
[Authorize(Roles = AuthRoles.Console)]
public sealed class AdminUserMetricsController : ControllerBase
{
    private const int DaysShown = 30;
    private static readonly TimeSpan IndiaOffset = TimeSpan.FromHours(5.5);

    private readonly ViviDbContext _db;

    public AdminUserMetricsController(ViviDbContext db) => _db = db;

    [HttpGet]
    [ProducesResponseType(typeof(UserMetricsResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<UserMetricsResponse>> Get(CancellationToken cancellationToken)
    {
        var nowUtc = DateTime.UtcNow;
        var todayIndia = (nowUtc + IndiaOffset).Date;
        var firstDay = todayIndia.AddDays(-(DaysShown - 1));
        var windowStartUtc = firstDay - IndiaOffset;
        DateTime DayOf(DateTime utc) => (utc + IndiaOffset).Date;

        var customers = _db.Customers.AsNoTracking();
        var totalUsers = await customers.CountAsync(cancellationToken);
        var usersBeforeWindow = await customers.CountAsync(c => c.CreatedAt < windowStartUtc, cancellationToken);

        var signups = (await customers.Where(c => c.CreatedAt >= windowStartUtc)
                .Select(c => c.CreatedAt).ToListAsync(cancellationToken))
            .GroupBy(DayOf).ToDictionary(g => g.Key, g => g.Count());

        // Activity signals we record: lesson progress, orders, live bookings.
        var activity = new List<(Guid CustomerId, DateTime At)>();
        activity.AddRange((await _db.VideoProgress.AsNoTracking().Where(v => v.UpdatedAt >= windowStartUtc)
            .Select(v => new { v.CustomerId, v.UpdatedAt }).ToListAsync(cancellationToken))
            .Select(v => (v.CustomerId, v.UpdatedAt)));
        activity.AddRange((await _db.Orders.AsNoTracking().Where(o => o.CreatedAt >= windowStartUtc)
            .Select(o => new { o.CustomerId, o.CreatedAt }).ToListAsync(cancellationToken))
            .Select(o => (o.CustomerId, o.CreatedAt)));
        activity.AddRange((await _db.LiveBookings.AsNoTracking().Where(b => b.CreatedAt >= windowStartUtc)
            .Select(b => new { b.CustomerId, b.CreatedAt }).ToListAsync(cancellationToken))
            .Select(b => (b.CustomerId, b.CreatedAt)));
        var activeByDay = activity.GroupBy(a => DayOf(a.At))
            .ToDictionary(g => g.Key, g => g.Select(a => a.CustomerId).Distinct().Count());

        var running = totalUsers;
        var daily = new List<UserMetricsDay>();
        for (var day = todayIndia; day >= firstDay; day = day.AddDays(-1))
        {
            var added = signups.GetValueOrDefault(day);
            daily.Add(new UserMetricsDay
            {
                Date = day.ToString("yyyy-MM-dd"),
                NewUsers = added,
                ActiveUsers = activeByDay.GetValueOrDefault(day),
                TotalUsers = running,
            });
            running -= added;
        }

        var offerQuery = _db.LaunchMemberships.AsNoTracking().Where(m => m.AccessExpiryDate > nowUtc);
        var offerClass = await offerQuery.Select(m => m.CustomerId).Distinct().CountAsync(cancellationToken);
        var offerItemIds = _db.LaunchMemberships.AsNoTracking().Select(m => m.OrderItemId);
        var otherCourse = await _db.CourseEnrollments.AsNoTracking()
            .Where(e => e.AccessExpiryDate > nowUtc && !offerItemIds.Contains(e.OrderItemId))
            .Select(e => e.CustomerId).Distinct().CountAsync(cancellationToken);
        var todayDate = DateOnly.FromDateTime(todayIndia);
        var live = await _db.LiveBookings.AsNoTracking()
            .Where(b => b.Status == LiveBookingStatus.Confirmed && b.Week!.EndDate >= todayDate)
            .Select(b => b.CustomerId).Distinct().CountAsync(cancellationToken);

        return Ok(new UserMetricsResponse
        {
            TotalUsers = totalUsers,
            OfferClassUsers = offerClass,
            OtherCourseUsers = otherCourse,
            LiveClassUsers = live,
            GrowthPercent = usersBeforeWindow == 0
                ? null
                : Math.Round((totalUsers - usersBeforeWindow) * 100m / usersBeforeWindow, 1),
            Daily = daily,
        });
    }
}
