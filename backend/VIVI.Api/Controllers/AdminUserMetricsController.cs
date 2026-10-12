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
    /// <summary>Tracking starts here; nothing earlier is shown.</summary>
    private static readonly DateTime FirstDay = new(2026, 10, 1);
    private static readonly TimeSpan IndiaOffset = TimeSpan.FromHours(5.5);

    private readonly ViviDbContext _db;

    public AdminUserMetricsController(ViviDbContext db) => _db = db;

    [HttpGet]
    [ProducesResponseType(typeof(UserMetricsResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<UserMetricsResponse>> Get(CancellationToken cancellationToken)
    {
        var nowUtc = DateTime.UtcNow;
        var todayIndia = (nowUtc + IndiaOffset).Date;
        var firstDay = todayIndia < FirstDay ? todayIndia : FirstDay;
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

    /// <summary>The customers behind one number in the daily table. <c>kind</c> is new, active or total.</summary>
    [HttpGet("users")]
    [ProducesResponseType(typeof(IReadOnlyList<UserMetricsUser>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<UserMetricsUser>>> Users(
        [FromQuery] string date,
        [FromQuery] string kind,
        CancellationToken cancellationToken)
    {
        if (!DateTime.TryParseExact(date, "yyyy-MM-dd", null, System.Globalization.DateTimeStyles.None, out var day))
            return BadRequest("date must be yyyy-MM-dd.");

        var startUtc = day - IndiaOffset;
        var endUtc = startUtc.AddDays(1);
        var customers = _db.Customers.AsNoTracking();

        IQueryable<VIVI.Core.Entities.Customer> query;
        switch (kind)
        {
            case "new":
                query = customers.Where(c => c.CreatedAt >= startUtc && c.CreatedAt < endUtc);
                break;
            case "total":
                query = customers.Where(c => c.CreatedAt < endUtc);
                break;
            case "active":
                var ids = _db.VideoProgress.AsNoTracking().Where(v => v.UpdatedAt >= startUtc && v.UpdatedAt < endUtc).Select(v => v.CustomerId)
                    .Union(_db.Orders.AsNoTracking().Where(o => o.CreatedAt >= startUtc && o.CreatedAt < endUtc).Select(o => o.CustomerId))
                    .Union(_db.LiveBookings.AsNoTracking().Where(b => b.CreatedAt >= startUtc && b.CreatedAt < endUtc).Select(b => b.CustomerId));
                query = customers.Where(c => ids.Contains(c.Id));
                break;
            default:
                return BadRequest("kind must be new, active or total.");
        }

        var rows = await query
            .OrderByDescending(c => c.CreatedAt)
            .Select(c => new { c.FullName, c.Email, c.PhoneNumber })
            .ToListAsync(cancellationToken);
        return Ok(rows.Select(c => new UserMetricsUser
        {
            Name = c.FullName,
            // Phone-OTP signups get a generated customer.<phone>@vivicrochet.dev address; it is not a real email.
            Email = c.Email.EndsWith("@vivicrochet.dev", StringComparison.OrdinalIgnoreCase) ? string.Empty : c.Email,
            Phone = c.PhoneNumber ?? string.Empty,
        }).ToList());
    }
}
