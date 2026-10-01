using VIVI.Core.Enums;

namespace VIVI.Core.Entities;

/// <summary>One Monday-start week in the Live Crochet Studio 52-week season.</summary>
public sealed class LiveWeek
{
    public Guid Id { get; set; }
    public int WeekNumber { get; set; }
    public int SeasonYear { get; set; }
    /// <summary>Monday 00:00 local India calendar date (stored as date).</summary>
    public DateOnly StartDate { get; set; }
    /// <summary>Sunday of the same calendar week.</summary>
    public DateOnly EndDate { get; set; }
    /// <summary>Optional single Mon–Fri studio break day. Saturday remains replacement-only; Sunday always OFF.</summary>
    public DayOfWeek? BreakWeekday { get; set; }
    public bool IsBookable { get; set; } = true;
    /// <summary>Display name of the tutor for this week (default SRI). Ignored unless <see cref="HasCustomTutor"/>.</summary>
    public string TutorName { get; set; } = "SRI";
    /// <summary>Blob path for the tutor portrait photo. Ignored unless <see cref="HasCustomTutor"/>.</summary>
    public string? TutorPhotoBlobPath { get; set; }
    /// <summary>
    /// When false (the default), this week shows the shared <see cref="LiveTutorDefault"/> name/photo.
    /// When true, it shows this week's own <see cref="TutorName"/>/<see cref="TutorPhotoBlobPath"/> instead —
    /// set automatically the first time an admin edits the tutor for this specific week.
    /// </summary>
    public bool HasCustomTutor { get; set; }
    /// <summary>Price for this week only; null uses <see cref="LiveSettings.PackagePrice"/>.</summary>
    public decimal? PriceOverride { get; set; }
    /// <summary>Class language for this week only; null uses <see cref="LiveSettings.Language"/>.</summary>
    public string? LanguageOverride { get; set; }
    /// <summary>Level for this week only; null uses <see cref="LiveSettings.Level"/>.</summary>
    public string? LevelOverride { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public ICollection<LiveWeekSlot> Slots { get; set; } = new List<LiveWeekSlot>();
    public ICollection<LiveBooking> Bookings { get; set; } = new List<LiveBooking>();
}

/// <summary>
/// Singleton row of studio-wide Live settings editable in the admin: price, class length,
/// language and level. Weeks can override price, language and level individually.
/// </summary>
public sealed class LiveSettings
{
    /// <summary>Fixed id — there is only ever one row in this table.</summary>
    public static readonly Guid SingletonId = Guid.Parse("22222222-2222-2222-2222-222222222222");

    public Guid Id { get; set; } = SingletonId;
    public decimal PackagePrice { get; set; }
    public int HoursPerClassDay { get; set; }
    public string Language { get; set; } = "Tamil";
    public string Level { get; set; } = "Basic";
    public DateTime UpdatedAt { get; set; }
}

/// <summary>
/// Name, timing and on/off state of one class session. Morning and Evening are always enabled;
/// Extra1–Extra3 are the optional additional sessions an admin can switch on.
/// </summary>
public sealed class LiveSessionDefinition
{
    public Guid Id { get; set; }
    public LiveSlotType SlotType { get; set; }
    public string Name { get; set; } = string.Empty;
    /// <summary>Display hours, e.g. "10:00 AM – 12:00 PM".</summary>
    public string Hours { get; set; } = string.Empty;
    public bool IsEnabled { get; set; }
    public DateTime UpdatedAt { get; set; }
}

/// <summary>
/// Singleton row holding the shared tutor name/photo shown for every Live week that has not
/// been individually customized (<see cref="LiveWeek.HasCustomTutor"/> is false).
/// </summary>
public sealed class LiveTutorDefault
{
    /// <summary>Fixed id — there is only ever one row in this table.</summary>
    public static readonly Guid SingletonId = Guid.Parse("11111111-1111-1111-1111-111111111111");

    public Guid Id { get; set; } = SingletonId;
    public string TutorName { get; set; } = "SRI";
    public string? TutorPhotoBlobPath { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public sealed class LiveWeekSlot
{
    public Guid Id { get; set; }
    public Guid LiveWeekId { get; set; }
    public LiveSlotType SlotType { get; set; }
    public int SeatCapacity { get; set; } = 4;
    /// <summary>Confirmed + pending-payment reservations currently held.</summary>
    public int SeatsBooked { get; set; }
    /// <summary>When true, customers cannot book this Morning/Evening circle for the week.</summary>
    public bool IsBlocked { get; set; }
    /// <summary>Timing for this week only; null uses the session's default hours.</summary>
    public string? HoursOverride { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public LiveWeek? Week { get; set; }
}

public sealed class LiveBooking
{
    public Guid Id { get; set; }
    public Guid CustomerId { get; set; }
    public Guid LiveWeekId { get; set; }
    public LiveSlotType SlotType { get; set; }
    public Guid OrderId { get; set; }
    public Guid OrderItemId { get; set; }
    public LiveBookingStatus Status { get; set; }
    public DateTime? ReservationExpiresAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public DateTime? ConfirmedAt { get; set; }

    public Customer? Customer { get; set; }
    public LiveWeek? Week { get; set; }
    public Order? Order { get; set; }
    public OrderItem? OrderItem { get; set; }
}
