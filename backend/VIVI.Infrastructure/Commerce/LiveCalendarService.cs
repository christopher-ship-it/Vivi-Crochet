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

    public string SlotName(LiveSlotType slotType) =>
        slotType == LiveSlotType.Morning ? _options.MorningSlotName : _options.EveningSlotName;

    public async Task EnsureSeasonAsync(CancellationToken cancellationToken)
    {
        var start = ParseSeasonStart();
        var year = start.Year;
        var existing = await _db.LiveWeeks.CountAsync(w => w.SeasonYear == year, cancellationToken);
        if (existing >= 52)
            return;

        var now = DateTime.UtcNow;
        for (var week = 1; week <= 52; week++)
        {
            var weekStart = start.AddDays((week - 1) * 7);
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
            // Fix FK on slots
            foreach (var slot in entity.Slots)
                slot.LiveWeekId = entity.Id;

            _db.LiveWeeks.Add(entity);
        }

        await _db.SaveChangesAsync(cancellationToken);
    }

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
                if (week.BreakWeekday.HasValue)
                {
                    kind = LiveDayKind.Replacement;
                    label = "REPLACEMENT";
                }
                else
                {
                    kind = LiveDayKind.Available;
                    label = "AVAILABLE";
                }
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

        var classDays = days.Count(d => d.Kind is LiveDayKind.Class or LiveDayKind.Replacement);
        if (week.BreakWeekday.HasValue && classDays != 5)
            throw ViviException.Conflict("INVALID_SCHEDULE", "A live week with one break must still have exactly 5 class days.");

        if (!week.BreakWeekday.HasValue)
        {
            var monFri = days.Count(d => d.Kind == LiveDayKind.Class);
            if (monFri != 5)
                throw ViviException.Conflict("INVALID_SCHEDULE", "A standard live week must have Monday–Friday classes.");
        }

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
        // Validate schedule shape
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
        if (seatCapacity < 1)
            throw ViviException.Conflict("INVALID_CAPACITY", "Seat capacity must be at least 1.");

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

    private DateOnly ParseSeasonStart()
    {
        if (!DateOnly.TryParse(_options.SeasonStartMonday, out var start))
            throw ViviException.Conflict("LIVE_SEASON_INVALID", "LiveStudio:SeasonStartMonday is invalid.");
        if (start.DayOfWeek != DayOfWeek.Monday)
            throw ViviException.Conflict("LIVE_SEASON_INVALID", "SeasonStartMonday must be a Monday.");
        return start;
    }
}
