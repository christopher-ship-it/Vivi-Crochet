using VIVI.Core.Enums;

namespace VIVI.Api.DTOs.Live;

public class LiveWeekSummaryResponse
{
    public Guid Id { get; set; }
    public int WeekNumber { get; set; }
    public int SeasonYear { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    public bool IsBookable { get; set; }
    public decimal PackagePrice { get; set; }
    /// <summary>Tutor display name for this week (default SRI).</summary>
    public string TutorName { get; set; } = "SRI";
    /// <summary>Resolved read URL for the tutor portrait, or null for placeholder.</summary>
    public string? TutorPhotoUrl { get; set; }
    public IReadOnlyList<LiveSlotAvailabilityResponse> Slots { get; set; } = Array.Empty<LiveSlotAvailabilityResponse>();
}

public sealed class LiveWeekDetailResponse : LiveWeekSummaryResponse
{
    public IReadOnlyList<LiveDayResponse> Days { get; set; } = Array.Empty<LiveDayResponse>();
    /// <summary>Hours of live learning included each week (Mon–Fri × 2 hrs).</summary>
    public int WeeklyLiveHours { get; set; }
    public int HoursPerClassDay { get; set; }
}

public sealed class LiveDayResponse
{
    public DateOnly Date { get; set; }
    public string Weekday { get; set; } = string.Empty;
    public string Kind { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
}

public sealed class LiveSlotAvailabilityResponse
{
    public string SlotType { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    /// <summary>Studio hours for this circle, e.g. 10:00 AM – 12:00 PM.</summary>
    public string Hours { get; set; } = string.Empty;
    public int SeatCapacity { get; set; }
    public int SeatsBooked { get; set; }
    public int SeatsRemaining { get; set; }
    public bool IsBlocked { get; set; }
    public string Status { get; set; } = string.Empty;
}

public sealed class CreateLiveBookingRequest
{
    public Guid WeekId { get; set; }
    public LiveSlotType SlotType { get; set; }
}

public sealed class CreateLiveBookingResponse
{
    public Guid BookingId { get; set; }
    public Guid OrderId { get; set; }
    public string OrderNumber { get; set; } = string.Empty;
    public string RazorpayOrderId { get; set; } = string.Empty;
    public string RazorpayKeyId { get; set; } = string.Empty;
    public int AmountPaise { get; set; }
    public string Currency { get; set; } = "INR";
    public decimal TotalAmount { get; set; }
    public string SlotName { get; set; } = string.Empty;
    public int WeekNumber { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
}

public sealed class LiveBookingResponse
{
    public Guid Id { get; set; }
    public Guid OrderId { get; set; }
    public string OrderNumber { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string SlotType { get; set; } = string.Empty;
    public string SlotName { get; set; } = string.Empty;
    public string SlotHours { get; set; } = string.Empty;
    public int WeekNumber { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    public decimal PackagePrice { get; set; }
    public int WeeklyLiveHours { get; set; }
    public IReadOnlyList<LiveDayResponse> Days { get; set; } = Array.Empty<LiveDayResponse>();
    public DateTime? ConfirmedAt { get; set; }
}

public sealed class SetLiveWeekBreakRequest
{
    /// <summary>Monday–Friday, or null to clear.</summary>
    public DayOfWeek? BreakWeekday { get; set; }
}

public sealed class SetLiveWeekBookableRequest
{
    public bool IsBookable { get; set; }
}

public sealed class SetLiveSlotCapacityRequest
{
    public int SeatCapacity { get; set; }
}

public sealed class SetLiveSlotBlockedRequest
{
    public bool IsBlocked { get; set; }
}

public class AdminLiveBookingListItemResponse
{
    public Guid Id { get; set; }
    public string Status { get; set; } = string.Empty;
    public string CustomerName { get; set; } = string.Empty;
    public string CustomerPhone { get; set; } = string.Empty;
    public string CustomerEmail { get; set; } = string.Empty;
    public int WeekNumber { get; set; }
    public int SeasonYear { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    public string SlotType { get; set; } = string.Empty;
    public string SlotName { get; set; } = string.Empty;
    public Guid OrderId { get; set; }
    public string OrderNumber { get; set; } = string.Empty;
    public decimal TotalAmount { get; set; }
    public string? PaymentStatus { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? ConfirmedAt { get; set; }
}

public sealed class AdminLiveBookingDetailResponse : AdminLiveBookingListItemResponse
{
    public DateTime? ReservationExpiresAt { get; set; }
    public int SeatCapacity { get; set; }
    public int SeatsBooked { get; set; }
    public int SeatsRemaining { get; set; }
    public string? BreakWeekday { get; set; }
    public bool IsBookable { get; set; }
    public IReadOnlyList<LiveDayResponse> Days { get; set; } = Array.Empty<LiveDayResponse>();
}

public sealed class AdminLiveWeekResponse
{
    public Guid Id { get; set; }
    public int WeekNumber { get; set; }
    public int SeasonYear { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    public string? BreakWeekday { get; set; }
    public bool IsBookable { get; set; }
    public decimal PackagePrice { get; set; }
    public string TutorName { get; set; } = "SRI";
    public string? TutorPhotoUrl { get; set; }
    public IReadOnlyList<LiveSlotAvailabilityResponse> Slots { get; set; } = Array.Empty<LiveSlotAvailabilityResponse>();
}

public sealed class LiveTutorPhotoUploadUrlRequest
{
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long FileSizeBytes { get; set; }
}

public sealed class LiveTutorPhotoUploadUrlResponse
{
    public string UploadUrl { get; set; } = string.Empty;
    public DateTimeOffset ExpiresAt { get; set; }
    public string BlobPath { get; set; } = string.Empty;
    public long MaxFileSizeBytes { get; set; }
}

public sealed class LiveTutorPhotoUploadCompleteRequest
{
    public string BlobPath { get; set; } = string.Empty;
    public long FileSizeBytes { get; set; }
    public string ContentType { get; set; } = string.Empty;
}

public sealed class SetLiveWeekTutorRequest
{
    public string TutorName { get; set; } = "SRI";
}
