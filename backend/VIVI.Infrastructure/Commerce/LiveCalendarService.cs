using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Infrastructure.Configuration;
using VIVI.Infrastructure.Data;

namespace VIVI.Infrastructure.Commerce;

public sealed record LiveDayPlan(DateOnly Date, DayOfWeek Weekday, LiveDayKind Kind, string Label);

public sealed class LiveCalendarService
{
    private readonly ViviDbContext _db;
    private readonly LiveStudioOptions _options;

    public LiveCalendarService(ViviDbContext db, IOptions<LiveStudioOptions> options)
    {
        _db = db;
        _options = options.Value;
    }

    public decimal PackagePrice => _options.PackagePrice;

    public int MaxSeatCapacity => _options.DefaultSeatCapacity;

    public int WeeklyLiveHours => _options.WeeklyLiveHours;

    public int HoursPerClassDay => _options.HoursPerClassDay;

    /// <summary>Calendar year of <c>LiveStudio:SeasonStartMonday</c> (primary season key).</summary>
    public int PrimarySeasonYear => ParseSeasonStart().Year;

    /// <summary>India-local calendar date for "today" (Live studio scheduling).</summary>
    public DateOnly GetIndiaToday()
    {
        var ist = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, IndiaTimeZone);
        return DateOnly.FromDateTime(ist);
    }

    /// <summary>India-local wall clock for "now" (Live studio scheduling).</summary>
    public DateTime GetIndiaNow(DateTime? utcNow = null)
    {
        var utc = utcNow ?? DateTime.UtcNow;
        if (utc.Kind == DateTimeKind.Unspecified)
            utc = DateTime.SpecifyKind(utc, DateTimeKind.Utc);
        else if (utc.Kind == DateTimeKind.Local)
            utc = utc.ToUniversalTime();
        return TimeZoneInfo.ConvertTimeFromUtc(utc, IndiaTimeZone);
    }

    /// <summary>Monday that starts the current Live week in India.</summary>
    public DateOnly GetCurrentWeekMonday(DateOnly? today = null)
    {
        var day = today ?? GetIndiaToday();
        var offset = ((int)day.DayOfWeek - (int)DayOfWeek.Monday + 7) % 7;
        return day.AddDays(-offset);
    }

    /// <summary>
    /// Morning Circle start time parsed from <see cref="LiveStudioOptions.MorningSlotHours"/>
    /// (e.g. "10:00 AM – 12:00 PM" → 10:00).
    /// </summary>
    public TimeOnly GetMorningCircleStartTime()
    {
        var raw = _options.MorningSlotHours ?? string.Empty;
        var match = System.Text.RegularExpressions.Regex.Match(
            raw,
            @"(\d{1,2}):(\d{2})\s*(AM|PM)?",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        if (!match.Success)
            return new TimeOnly(10, 0);

        var hour = int.Parse(match.Groups[1].Value);
        var minute = int.Parse(match.Groups[2].Value);
        var ap = match.Groups[3].Value;
        if (ap.Equals("PM", StringComparison.OrdinalIgnoreCase) && hour < 12)
            hour += 12;
        if (ap.Equals("AM", StringComparison.OrdinalIgnoreCase) && hour == 12)
            hour = 0;
        return new TimeOnly(hour, minute);
    }

    /// <summary>
    /// Instant (UTC) when new bookings close for a Mon–Fri batch:
    /// Monday Morning Circle start in India.
    /// </summary>
    public DateTime GetWeekBookingCutoffUtc(DateOnly weekMonday)
    {
        var local = DateTime.SpecifyKind(
            weekMonday.ToDateTime(GetMorningCircleStartTime()),
            DateTimeKind.Unspecified);
        return TimeZoneInfo.ConvertTimeToUtc(local, IndiaTimeZone);
    }

    /// <summary>
    /// True until Monday Morning Circle start for that week.
    /// After that, the entire Mon–Fri batch is closed for new customers.
    /// </summary>
    public bool IsWeekOpenForNewBookings(DateOnly weekMonday, DateTime? utcNow = null)
    {
        var now = utcNow ?? DateTime.UtcNow;
        if (now.Kind == DateTimeKind.Unspecified)
            now = DateTime.SpecifyKind(now, DateTimeKind.Utc);
        else if (now.Kind == DateTimeKind.Local)
            now = now.ToUniversalTime();
        return now < GetWeekBookingCutoffUtc(weekMonday);
    }

    /// <summary>
    /// Customer-facing bookable window: always the next <see cref="LiveStudioOptions.CustomerSelectableWeekCount"/>
    /// open weeks (default 2).
    /// Example: Week 38 open until Mon 10:00 IST → show 38+39; after that → 39+40;
    /// Week 39 until its Mon 10:00 IST → then 40+41.
    /// A count of 52+ means the full season (used by tests).
    /// </summary>
    public IReadOnlyList<DateOnly> GetCustomerSelectableWeekStarts(
        DateOnly? today = null,
        DateTime? utcNow = null)
    {
        var count = Math.Max(1, _options.CustomerSelectableWeekCount);
        if (count >= 52)
            return Array.Empty<DateOnly>(); // signal: no date filter / full season

        var nowUtc = utcNow ?? DateTime.UtcNow;
        var day = today ?? DateOnly.FromDateTime(GetIndiaNow(nowUtc));
        var monday = GetCurrentWeekMonday(day);
        if (!IsWeekOpenForNewBookings(monday, nowUtc))
            monday = monday.AddDays(7);

        var starts = new List<DateOnly>(count);
        for (var i = 0; i < count; i++)
            starts.Add(monday.AddDays(i * 7));
        return starts;
    }

    public bool IsCustomerSelectableWeek(
        LiveWeek week,
        DateOnly? today = null,
        DateTime? utcNow = null)
    {
        if (_options.CustomerSelectableWeekCount >= 52)
            return true;

        var starts = GetCustomerSelectableWeekStarts(today, utcNow);
        return starts.Contains(week.StartDate);
    }

    public string SlotName(LiveSlotType slotType) =>
        slotType == LiveSlotType.Morning ? _options.MorningSlotName : _options.EveningSlotName;

    public string SlotHours(LiveSlotType slotType) =>
        slotType == LiveSlotType.Morning ? _options.MorningSlotHours : _options.EveningSlotHours;

    /// <summary>Length of one Live season in weeks.</summary>
    public const int WeeksPerSeason = 52;

    /// <summary>
    /// Ensures the active season and the next one exist (104 weeks max seeded ahead).
    /// Seasons are continuous: next Week 1 starts the Monday after the previous Week 52.
    /// </summary>
    public async Task EnsureSeasonAsync(CancellationToken cancellationToken)
    {
        var baseStart = ParseSeasonStart();
        var today = GetIndiaToday();
        var activeIndex = GetSeasonIndex(baseStart, today);

        // Active + next covers the customer 2-week window across the season boundary.
        for (var i = activeIndex; i <= activeIndex + 1; i++)
        {
            var seasonStart = baseStart.AddDays(i * WeeksPerSeason * 7);
            await EnsureSingleSeasonAsync(seasonStart, cancellationToken);
        }

        await NormalizeSeatCapacitiesAsync(cancellationToken);
    }

    /// <summary>
    /// 0-based season index relative to <paramref name="baseStart"/> for a calendar day.
    /// Days before the first season map to 0 so Week 1 is ready early.
    /// </summary>
    public static int GetSeasonIndex(DateOnly baseStart, DateOnly day)
    {
        var days = day.DayNumber - baseStart.DayNumber;
        if (days < 0)
            return 0;
        return days / (WeeksPerSeason * 7);
    }

    private async Task EnsureSingleSeasonAsync(DateOnly seasonStart, CancellationToken cancellationToken)
    {
        if (seasonStart.DayOfWeek != DayOfWeek.Monday)
            throw ViviException.Conflict("LIVE_SEASON_INVALID", "Season start must be a Monday.");

        var year = seasonStart.Year;
        var existing = await _db.LiveWeeks.CountAsync(w => w.SeasonYear == year, cancellationToken);
        if (existing >= WeeksPerSeason)
            return;

        var now = DateTime.UtcNow;
        for (var week = 1; week <= WeeksPerSeason; week++)
        {
            var weekStart = seasonStart.AddDays((week - 1) * 7);
            var weekEnd = weekStart.AddDays(6);
            var already = await _db.LiveWeeks.AnyAsync(
                w => w.SeasonYear == year && w.WeekNumber == week,
                cancellationToken);
            if (already)
                continue;

            var entity = new LiveWeek
            {
                Id = Guid.NewGuid(),
                WeekNumber = week,
                SeasonYear = year,
                StartDate = weekStart,
                EndDate = weekEnd,
                IsBookable = true,
                TutorName = "SRI",
                CreatedAt = now,
                UpdatedAt = now,
                Slots =
                {
                    new LiveWeekSlot
                    {
                        Id = Guid.NewGuid(),
                        SlotType = LiveSlotType.Morning,
                        SeatCapacity = _options.DefaultSeatCapacity,
                        SeatsBooked = 0,
                        CreatedAt = now,
                        UpdatedAt = now
                    },
                    new LiveWeekSlot
                    {
                        Id = Guid.NewGuid(),
                        SlotType = LiveSlotType.Evening,
                        SeatCapacity = _options.DefaultSeatCapacity,
                        SeatsBooked = 0,
                        CreatedAt = now,
                        UpdatedAt = now
                    }
                }
            };
            foreach (var slot in entity.Slots)
                slot.LiveWeekId = entity.Id;

            _db.LiveWeeks.Add(entity);
        }

        await _db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>
    /// Final studio week shape:
    /// Mon–Fri = Class (or one optional admin Break weekday),
    /// Saturday = Replacement only (never a normal class day),
    /// Sunday = OFF.
    /// </summary>
    public IReadOnlyList<LiveDayPlan> BuildDayPlan(LiveWeek week)
    {
        if (week.BreakWeekday is DayOfWeek.Sunday)
            throw ViviException.Conflict("INVALID_BREAK", "Sunday cannot be a class break day.");

        if (week.BreakWeekday is DayOfWeek.Saturday)
            throw ViviException.Conflict("INVALID_BREAK", "Saturday cannot be marked as a weekday break.");

        var days = new List<LiveDayPlan>(7);
        for (var i = 0; i < 7; i++)
        {
            var date = week.StartDate.AddDays(i);
            var weekday = date.DayOfWeek;
            LiveDayKind kind;
            string label;

            if (weekday == DayOfWeek.Sunday)
            {
                kind = LiveDayKind.Off;
                label = "OFF";
            }
            else if (weekday == DayOfWeek.Saturday)
            {
                // Always reserved for missed Mon–Fri make-up — never a sixth regular class.
                kind = LiveDayKind.Replacement;
                label = "REPLACEMENT";
            }
            else if (week.BreakWeekday.HasValue && weekday == week.BreakWeekday.Value)
            {
                kind = LiveDayKind.Break;
                label = "NO CLASS";
            }
            else
            {
                kind = LiveDayKind.Class;
                label = "CLASS";
            }

            days.Add(new LiveDayPlan(date, weekday, kind, label));
        }

        var monFriClass = days.Count(d =>
            d.Weekday is >= DayOfWeek.Monday and <= DayOfWeek.Friday
            && d.Kind == LiveDayKind.Class);
        var monFriBreak = days.Count(d =>
            d.Weekday is >= DayOfWeek.Monday and <= DayOfWeek.Friday
            && d.Kind == LiveDayKind.Break);

        if (week.BreakWeekday.HasValue)
        {
            if (monFriBreak != 1 || monFriClass != 4)
                throw ViviException.Conflict(
                    "INVALID_SCHEDULE",
                    "A live week with one break must have 4 weekday classes and 1 weekday break.");
        }
        else if (monFriClass != 5)
        {
            throw ViviException.Conflict(
                "INVALID_SCHEDULE",
                "A standard live week must have Monday–Friday classes.");
        }

        if (days.Count(d => d.Weekday == DayOfWeek.Saturday && d.Kind == LiveDayKind.Replacement) != 1)
            throw ViviException.Conflict("INVALID_SCHEDULE", "Saturday must be a replacement class day.");

        if (days.Count(d => d.Weekday == DayOfWeek.Sunday && d.Kind == LiveDayKind.Off) != 1)
            throw ViviException.Conflict("INVALID_SCHEDULE", "Sunday must be OFF.");

        return days;
    }

    public async Task SetBreakAsync(Guid weekId, DayOfWeek? breakWeekday, CancellationToken cancellationToken)
    {
        if (breakWeekday is DayOfWeek.Sunday or DayOfWeek.Saturday)
            throw ViviException.Conflict("INVALID_BREAK", "Break day must be Monday–Friday.");

        var week = await _db.LiveWeeks.SingleOrDefaultAsync(w => w.Id == weekId, cancellationToken)
            ?? throw ViviException.NotFound("LIVE_WEEK_NOT_FOUND", "Live week was not found.");

        week.BreakWeekday = breakWeekday;
        week.UpdatedAt = DateTime.UtcNow;
        _ = BuildDayPlan(week);
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task SetBookableAsync(Guid weekId, bool isBookable, CancellationToken cancellationToken)
    {
        var week = await _db.LiveWeeks.SingleOrDefaultAsync(w => w.Id == weekId, cancellationToken)
            ?? throw ViviException.NotFound("LIVE_WEEK_NOT_FOUND", "Live week was not found.");

        week.IsBookable = isBookable;
        week.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task SetSlotCapacityAsync(
        Guid weekId,
        LiveSlotType slotType,
        int seatCapacity,
        CancellationToken cancellationToken)
    {
        if (seatCapacity < 1 || seatCapacity > _options.DefaultSeatCapacity)
        {
            throw ViviException.Conflict(
                "INVALID_CAPACITY",
                $"Seat capacity must be between 1 and {_options.DefaultSeatCapacity}.");
        }

        var slot = await _db.LiveWeekSlots
            .SingleOrDefaultAsync(s => s.LiveWeekId == weekId && s.SlotType == slotType, cancellationToken)
            ?? throw ViviException.NotFound("LIVE_SLOT_NOT_FOUND", "Live slot was not found.");

        if (seatCapacity < slot.SeatsBooked)
            throw ViviException.Conflict(
                "CAPACITY_BELOW_BOOKED",
                $"Seat capacity cannot be below current bookings ({slot.SeatsBooked}).");

        slot.SeatCapacity = seatCapacity;
        slot.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task SetSlotBlockedAsync(
        Guid weekId,
        LiveSlotType slotType,
        bool isBlocked,
        CancellationToken cancellationToken)
    {
        var slot = await _db.LiveWeekSlots
            .SingleOrDefaultAsync(s => s.LiveWeekId == weekId && s.SlotType == slotType, cancellationToken)
            ?? throw ViviException.NotFound("LIVE_SLOT_NOT_FOUND", "Live slot was not found.");

        slot.IsBlocked = isBlocked;
        slot.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>
    /// Brings existing season slots that exceed the configured max (4) down when safe.
    /// Slots already booked above the new max keep capacity at SeatsBooked.
    /// </summary>
    public async Task NormalizeSeatCapacitiesAsync(CancellationToken cancellationToken)
    {
        var max = _options.DefaultSeatCapacity;
        var slots = await _db.LiveWeekSlots
            .Where(s => s.SeatCapacity > max)
            .ToListAsync(cancellationToken);
        if (slots.Count == 0)
            return;

        var now = DateTime.UtcNow;
        foreach (var slot in slots)
        {
            slot.SeatCapacity = Math.Max(slot.SeatsBooked, max);
            slot.UpdatedAt = now;
        }

        await _db.SaveChangesAsync(cancellationToken);
    }

    private DateOnly ParseSeasonStart()
    {
        if (!DateOnly.TryParse(_options.SeasonStartMonday, out var start))
            throw ViviException.Conflict("LIVE_SEASON_INVALID", "LiveStudio:SeasonStartMonday is invalid.");
        if (start.DayOfWeek != DayOfWeek.Monday)
            throw ViviException.Conflict("LIVE_SEASON_INVALID", "SeasonStartMonday must be a Monday.");
        return start;
    }

    private static readonly TimeZoneInfo IndiaTimeZone = ResolveIndiaTimeZone();

    private static TimeZoneInfo ResolveIndiaTimeZone()
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById("India Standard Time");
        }
        catch (TimeZoneNotFoundException)
        {
            return TimeZoneInfo.FindSystemTimeZoneById("Asia/Kolkata");
        }
    }
}
