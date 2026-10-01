using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Infrastructure.Configuration;
using VIVI.Infrastructure.Data;

namespace VIVI.Infrastructure.Commerce;

public sealed record LiveDayPlan(DateOnly Date, DayOfWeek Weekday, LiveDayKind Kind, string Label);

public sealed record LiveSessionInfo(LiveSlotType SlotType, string Name, string Hours, bool IsEnabled);

public sealed record LiveSessionUpdate(LiveSlotType SlotType, string Name, string Hours, bool IsEnabled);

/// <summary>Studio-wide Live settings: admin-edited values from the database, config defaults otherwise.</summary>
public sealed record LiveSettingsSnapshot(
    decimal PackagePrice,
    int HoursPerClassDay,
    string Language,
    string Level,
    IReadOnlyDictionary<LiveSlotType, LiveSessionInfo> Sessions);

public sealed class LiveCalendarService
{
    public const string DefaultLanguage = "Tamil";
    public const string DefaultLevel = "Basic";

    private readonly ViviDbContext _db;
    private readonly LiveStudioOptions _options;
    private LiveSettingsSnapshot? _settings;

    public LiveCalendarService(ViviDbContext db, IOptions<LiveStudioOptions> options)
    {
        _db = db;
        _options = options.Value;
    }

    /// <summary>Studio-wide settings, loaded once per request (this service is scoped).</summary>
    private LiveSettingsSnapshot Settings => _settings ??= LoadSettingsSync();

    public async Task<LiveSettingsSnapshot> GetSettingsAsync(CancellationToken cancellationToken)
    {
        if (_settings is not null)
            return _settings;

        var row = await _db.LiveSettings.AsNoTracking().FirstOrDefaultAsync(cancellationToken);
        var sessions = await _db.LiveSessionDefinitions.AsNoTracking().ToListAsync(cancellationToken);
        return _settings = BuildSettings(row, sessions);
    }

    private LiveSettingsSnapshot LoadSettingsSync()
    {
        var row = _db.LiveSettings.AsNoTracking().FirstOrDefault();
        var sessions = _db.LiveSessionDefinitions.AsNoTracking().ToList();
        return BuildSettings(row, sessions);
    }

    private LiveSettingsSnapshot BuildSettings(LiveSettings? row, IReadOnlyList<LiveSessionDefinition> sessions)
    {
        var map = new Dictionary<LiveSlotType, LiveSessionInfo>();
        foreach (var slotType in Enum.GetValues<LiveSlotType>())
        {
            var (name, hours, enabled) = DefaultSession(slotType);
            var saved = sessions.FirstOrDefault(s => s.SlotType == slotType);
            map[slotType] = saved is null
                ? new LiveSessionInfo(slotType, name, hours, enabled)
                : new LiveSessionInfo(
                    slotType,
                    saved.Name,
                    saved.Hours,
                    IsCoreSession(slotType) || saved.IsEnabled);
        }

        return new LiveSettingsSnapshot(
            row?.PackagePrice ?? _options.PackagePrice,
            row?.HoursPerClassDay ?? _options.HoursPerClassDay,
            row?.Language ?? DefaultLanguage,
            row?.Level ?? DefaultLevel,
            map);
    }

    private (string Name, string Hours, bool Enabled) DefaultSession(LiveSlotType slotType) => slotType switch
    {
        LiveSlotType.Morning => (_options.MorningSlotName, _options.MorningSlotHours, true),
        LiveSlotType.Evening => (_options.EveningSlotName, _options.EveningSlotHours, true),
        LiveSlotType.Extra1 => ("Additional session 1", "12:00 PM – 2:00 PM", false),
        LiveSlotType.Extra2 => ("Additional session 2", "2:00 PM – 4:00 PM", false),
        _ => ("Additional session 3", "4:00 PM – 6:00 PM", false)
    };

    public static bool IsCoreSession(LiveSlotType slotType) =>
        slotType is LiveSlotType.Morning or LiveSlotType.Evening;

    /// <summary>Studio-wide default package price. Use <see cref="PriceFor"/> for a specific week.</summary>
    public decimal PackagePrice => Settings.PackagePrice;

    public decimal PriceFor(LiveWeek week) => week.PriceOverride ?? Settings.PackagePrice;

    public string LanguageFor(LiveWeek week) =>
        string.IsNullOrWhiteSpace(week.LanguageOverride) ? Settings.Language : week.LanguageOverride.Trim();

    public string LevelFor(LiveWeek week) =>
        string.IsNullOrWhiteSpace(week.LevelOverride) ? Settings.Level : week.LevelOverride.Trim();

    public bool IsSlotEnabled(LiveSlotType slotType) =>
        Settings.Sessions.TryGetValue(slotType, out var info) && info.IsEnabled;

    public string SlotHoursFor(LiveWeekSlot slot) =>
        string.IsNullOrWhiteSpace(slot.HoursOverride) ? SlotHours(slot.SlotType) : slot.HoursOverride.Trim();

    public int MaxSeatCapacity => _options.DefaultSeatCapacity;

    public int WeeklyLiveHours => Settings.HoursPerClassDay * _options.ClassDaysPerWeek;

    public int HoursPerClassDay => Settings.HoursPerClassDay;

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
        var raw = SlotHours(LiveSlotType.Morning);
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

    public string SlotName(LiveSlotType slotType) => Settings.Sessions[slotType].Name;

    /// <summary>Default hours for a session. Use <see cref="SlotHoursFor"/> for a specific week's slot.</summary>
    public string SlotHours(LiveSlotType slotType) => Settings.Sessions[slotType].Hours;

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
        await EnsureExtraSlotsAsync(cancellationToken);
    }

    /// <summary>
    /// Adds a slot row for every enabled additional session to each current/future week that
    /// does not have one yet (Morning and Evening rows are created with the week).
    /// </summary>
    public async Task EnsureExtraSlotsAsync(CancellationToken cancellationToken)
    {
        var settings = await GetSettingsAsync(cancellationToken);
        var extras = settings.Sessions.Values
            .Where(s => s.IsEnabled && !IsCoreSession(s.SlotType))
            .Select(s => s.SlotType)
            .ToList();
        if (extras.Count == 0)
            return;

        var today = GetIndiaToday();
        var weekIds = await _db.LiveWeeks
            .Where(w => w.EndDate >= today)
            .Select(w => w.Id)
            .ToListAsync(cancellationToken);
        var existing = (await _db.LiveWeekSlots
                .Where(s => extras.Contains(s.SlotType))
                .Select(s => new { s.LiveWeekId, s.SlotType })
                .ToListAsync(cancellationToken))
            .Select(s => (s.LiveWeekId, s.SlotType))
            .ToHashSet();

        var now = DateTime.UtcNow;
        var added = false;
        foreach (var weekId in weekIds)
        {
            foreach (var slotType in extras)
            {
                if (existing.Contains((weekId, slotType)))
                    continue;
                _db.LiveWeekSlots.Add(new LiveWeekSlot
                {
                    Id = Guid.NewGuid(),
                    LiveWeekId = weekId,
                    SlotType = slotType,
                    SeatCapacity = _options.DefaultSeatCapacity,
                    SeatsBooked = 0,
                    CreatedAt = now,
                    UpdatedAt = now
                });
                added = true;
            }
        }

        if (added)
            await _db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>Saves studio-wide Live settings and the session list, validating every field.</summary>
    public async Task<LiveSettingsSnapshot> UpdateSettingsAsync(
        decimal packagePrice,
        int hoursPerClassDay,
        string language,
        string level,
        IReadOnlyList<LiveSessionUpdate> sessions,
        CancellationToken cancellationToken)
    {
        ValidatePrice(packagePrice);
        if (hoursPerClassDay is < 1 or > 8)
            throw new ViviException("INVALID_HOURS", "Hours per class day must be between 1 and 8.");
        language = RequireText(language, 40, "INVALID_LANGUAGE", "Language");
        level = RequireText(level, 40, "INVALID_LEVEL", "Level");

        foreach (var update in sessions)
        {
            RequireText(update.Name, 100, "INVALID_SESSION_NAME", "Session name");
            RequireText(update.Hours, 60, "INVALID_SESSION_HOURS", "Session timing");
            if (IsCoreSession(update.SlotType) && !update.IsEnabled)
                throw ViviException.Conflict(
                    "CORE_SESSION_REQUIRED",
                    "Morning and Evening sessions cannot be switched off.");
        }

        var now = DateTime.UtcNow;
        var row = await _db.LiveSettings.SingleOrDefaultAsync(
            x => x.Id == LiveSettings.SingletonId, cancellationToken);
        if (row is null)
        {
            row = new LiveSettings { Id = LiveSettings.SingletonId };
            _db.LiveSettings.Add(row);
        }

        row.PackagePrice = packagePrice;
        row.HoursPerClassDay = hoursPerClassDay;
        row.Language = language;
        row.Level = level;
        row.UpdatedAt = now;

        var existing = await _db.LiveSessionDefinitions.ToListAsync(cancellationToken);
        var today = GetIndiaToday();
        foreach (var update in sessions)
        {
            var def = existing.FirstOrDefault(d => d.SlotType == update.SlotType);
            if (def is null)
            {
                def = new LiveSessionDefinition { Id = Guid.NewGuid(), SlotType = update.SlotType };
                _db.LiveSessionDefinitions.Add(def);
                existing.Add(def);
            }
            else if (def.IsEnabled && !update.IsEnabled)
            {
                var hasBookings = await _db.LiveBookings.AnyAsync(
                    b => b.SlotType == update.SlotType
                         && b.Week != null
                         && b.Week.EndDate >= today
                         && (b.Status == LiveBookingStatus.Confirmed
                             || b.Status == LiveBookingStatus.PendingPayment),
                    cancellationToken);
                if (hasBookings)
                    throw ViviException.Conflict(
                        "SESSION_HAS_BOOKINGS",
                        "This session has upcoming bookings, so it cannot be switched off yet.");
            }

            def.Name = update.Name.Trim();
            def.Hours = update.Hours.Trim();
            def.IsEnabled = IsCoreSession(update.SlotType) || update.IsEnabled;
            def.UpdatedAt = now;
        }

        await _db.SaveChangesAsync(cancellationToken);
        _settings = null;
        await EnsureExtraSlotsAsync(cancellationToken);
        return await GetSettingsAsync(cancellationToken);
    }

    /// <summary>Sets or clears (null) this week's price, language and level overrides.</summary>
    public async Task SetWeekOverridesAsync(
        Guid weekId,
        decimal? priceOverride,
        string? languageOverride,
        string? levelOverride,
        CancellationToken cancellationToken)
    {
        if (priceOverride.HasValue)
            ValidatePrice(priceOverride.Value);
        var language = string.IsNullOrWhiteSpace(languageOverride)
            ? null
            : RequireText(languageOverride, 40, "INVALID_LANGUAGE", "Language");
        var level = string.IsNullOrWhiteSpace(levelOverride)
            ? null
            : RequireText(levelOverride, 40, "INVALID_LEVEL", "Level");

        var week = await _db.LiveWeeks.SingleOrDefaultAsync(w => w.Id == weekId, cancellationToken)
            ?? throw ViviException.NotFound("LIVE_WEEK_NOT_FOUND", "Live week was not found.");

        week.PriceOverride = priceOverride;
        week.LanguageOverride = language;
        week.LevelOverride = level;
        week.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>Sets or clears (null) the timing of one session for one week.</summary>
    public async Task SetSlotHoursOverrideAsync(
        Guid weekId,
        LiveSlotType slotType,
        string? hours,
        CancellationToken cancellationToken)
    {
        var value = string.IsNullOrWhiteSpace(hours)
            ? null
            : RequireText(hours, 60, "INVALID_SESSION_HOURS", "Session timing");

        var slot = await _db.LiveWeekSlots
            .SingleOrDefaultAsync(s => s.LiveWeekId == weekId && s.SlotType == slotType, cancellationToken)
            ?? throw ViviException.NotFound("LIVE_SLOT_NOT_FOUND", "Live slot was not found.");

        slot.HoursOverride = value;
        slot.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
    }

    private static void ValidatePrice(decimal price)
    {
        if (price < 1m || price > 100000m)
            throw new ViviException("INVALID_PRICE", "Price must be between ₹1 and ₹1,00,000.");
    }

    private static string RequireText(string? value, int maxLength, string code, string label)
    {
        var trimmed = (value ?? string.Empty).Trim();
        if (trimmed.Length == 0)
            throw new ViviException(code, $"{label} is required.");
        if (trimmed.Length > maxLength)
            throw new ViviException(code, $"{label} must be {maxLength} characters or fewer.");
        return trimmed;
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

    /// <summary>
    /// Loads the shared default tutor row (name/photo shown for every week that hasn't been
    /// individually customized), creating it with "SRI" / no photo on first use.
    /// </summary>
    public async Task<LiveTutorDefault> GetOrCreateTutorDefaultAsync(CancellationToken cancellationToken)
    {
        var row = await _db.LiveTutorDefaults
            .SingleOrDefaultAsync(x => x.Id == LiveTutorDefault.SingletonId, cancellationToken);
        if (row is not null)
            return row;

        row = new LiveTutorDefault
        {
            Id = LiveTutorDefault.SingletonId,
            TutorName = "SRI",
            TutorPhotoBlobPath = null,
            UpdatedAt = DateTime.UtcNow
        };
        _db.LiveTutorDefaults.Add(row);
        await _db.SaveChangesAsync(cancellationToken);
        return row;
    }

    /// <summary>
    /// The tutor name/photo that should actually be shown for <paramref name="week"/>:
    /// its own values when customized (<see cref="LiveWeek.HasCustomTutor"/>), otherwise the
    /// shared default.
    /// </summary>
    public static (string TutorName, string? TutorPhotoBlobPath) ResolveEffectiveTutor(
        LiveWeek week,
        LiveTutorDefault tutorDefault)
    {
        if (week.HasCustomTutor)
        {
            var ownName = string.IsNullOrWhiteSpace(week.TutorName) ? "SRI" : week.TutorName.Trim();
            return (ownName, week.TutorPhotoBlobPath);
        }

        var defaultName = string.IsNullOrWhiteSpace(tutorDefault.TutorName)
            ? "SRI"
            : tutorDefault.TutorName.Trim();
        return (defaultName, tutorDefault.TutorPhotoBlobPath);
    }

    /// <summary>
    /// Marks <paramref name="week"/> as individually customized, seeding its own name/photo from
    /// the current shared default the first time this happens so switching to "custom" doesn't
    /// visually change whichever field the caller isn't about to overwrite. No-op if already custom.
    /// </summary>
    public static void ActivateCustomTutor(LiveWeek week, LiveTutorDefault tutorDefault)
    {
        if (week.HasCustomTutor)
            return;

        week.TutorName = string.IsNullOrWhiteSpace(tutorDefault.TutorName)
            ? "SRI"
            : tutorDefault.TutorName.Trim();
        week.TutorPhotoBlobPath = tutorDefault.TutorPhotoBlobPath;
        week.HasCustomTutor = true;
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
