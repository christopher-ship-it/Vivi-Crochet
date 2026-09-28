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
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public ICollection<LiveWeekSlot> Slots { get; set; } = new List<LiveWeekSlot>();
    public ICollection<LiveBooking> Bookings { get; set; } = new List<LiveBooking>();
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
