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
    /// <summary>Price for this week (the studio price unless the week has its own).</summary>
    public decimal PackagePrice { get; set; }
    public string Language { get; set; } = string.Empty;
    public string Level { get; set; } = string.Empty;
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
    /// <summary>This week's own timing, when it differs from the session default (admin view).</summary>
    public string? HoursOverride { get; set; }
    public int SeatCapacity { get; set; }
    public int SeatsBooked { get; set; }
    public int SeatsRemaining { get; set; }
    public bool IsBlocked { get; set; }
    public string Status { get; set; } = string.Empty;
}

public sealed class CreateLiveBookingRequest
{
    /// <summary>First week of the booking.</summary>
    public Guid WeekId { get; set; }
    public LiveSlotType SlotType { get; set; }
    /// <summary>Course to book; null books the original single-week package.</summary>
    public Guid? CourseId { get; set; }
}

public sealed class LiveCourseProjectDto
{
    public string Name { get; set; } = string.Empty;
    public string? ImageUrl { get; set; }
}

/// <summary>A Live course as the app and the admin both see it.</summary>
public sealed class LiveCourseResponse
{
    public Guid Id { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Level { get; set; } = string.Empty;
    public string Tagline { get; set; } = string.Empty;
    public decimal Price { get; set; }
    /// <summary>Original price shown struck through; null means no discount.</summary>
    public decimal? Mrp { get; set; }
    public int DurationDays { get; set; }
    public int HoursPerDay { get; set; }
    public int WeeksSpan { get; set; }
    public bool IsBundle { get; set; }
    public bool IsActive { get; set; }
    public int SortOrder { get; set; }
    public IReadOnlyList<string> Learn { get; set; } = Array.Empty<string>();
    public IReadOnlyList<LiveCourseProjectDto> Projects { get; set; } = Array.Empty<LiveCourseProjectDto>();
}

public sealed class UpdateLiveCourseRequest
{
    public string Name { get; set; } = string.Empty;
    public string Level { get; set; } = string.Empty;
    public string Tagline { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public decimal? Mrp { get; set; }
    public int DurationDays { get; set; }
    public int HoursPerDay { get; set; }
    public int WeeksSpan { get; set; }
    public bool IsActive { get; set; }
    public List<string> Learn { get; set; } = new();
    public List<LiveCourseProjectDto> Projects { get; set; } = new();
}

public sealed class CreateLiveBookingResponse
{
    public Guid BookingId { get; set; }
    public Guid OrderId { get; set; }
    public string OrderNumber { get; set; } = string.Empty;
    public string PaymentProvider { get; set; } = "Razorpay";
    public string RazorpayOrderId { get; set; } = string.Empty;
    public string RazorpayKeyId { get; set; } = string.Empty;
    public int AmountPaise { get; set; }
    public string Currency { get; set; } = "INR";
    public decimal TotalAmount { get; set; }
    public string SlotName { get; set; } = string.Empty;
    public int WeekNumber { get; set; }
    public DateOnly StartDate { get; set; }
    /// <summary>Last day of the last week the booking covers.</summary>
    public DateOnly EndDate { get; set; }
    public string? CourseName { get; set; }
    public int WeeksHeld { get; set; } = 1;
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
    public string? CourseName { get; set; }
    public int WeeksHeld { get; set; } = 1;
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
    public string? CourseName { get; set; }
    public int WeeksHeld { get; set; } = 1;
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
    /// <summary>Price customers pay for this week.</summary>
    public decimal PackagePrice { get; set; }
    public decimal? PriceOverride { get; set; }
    public string Language { get; set; } = string.Empty;
    public string? LanguageOverride { get; set; }
    public string Level { get; set; } = string.Empty;
    public string? LevelOverride { get; set; }
    public string TutorName { get; set; } = "SRI";
    public string? TutorPhotoUrl { get; set; }
    /// <summary>True when this week has its own tutor name/photo instead of the shared default.</summary>
    public bool HasCustomTutor { get; set; }
    public IReadOnlyList<LiveSlotAvailabilityResponse> Slots { get; set; } = Array.Empty<LiveSlotAvailabilityResponse>();
}

/// <summary>The shared tutor name/photo shown for every Live week without its own override.</summary>
public sealed class AdminLiveTutorDefaultResponse
{
    public string TutorName { get; set; } = "SRI";
    public string? TutorPhotoUrl { get; set; }
}

public sealed class AdminLiveSessionDto
{
    /// <summary>Morning, Evening, Extra1, Extra2 or Extra3.</summary>
    public LiveSlotType SlotType { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Hours { get; set; } = string.Empty;
    public bool IsEnabled { get; set; }
    /// <summary>Morning and Evening are always on and cannot be removed.</summary>
    public bool IsCore { get; set; }
}

public sealed class AdminLiveSettingsResponse
{
    public decimal PackagePrice { get; set; }
    public int HoursPerClassDay { get; set; }
    public string Language { get; set; } = string.Empty;
    public string Level { get; set; } = string.Empty;
    /// <summary>WhatsApp number for class enquiries (digits with country code); empty hides the button.</summary>
    public string EnquiryWhatsApp { get; set; } = string.Empty;
    public IReadOnlyList<AdminLiveSessionDto> Sessions { get; set; } = Array.Empty<AdminLiveSessionDto>();
}

/// <summary>What the Live page needs to send a class enquiry.</summary>
public sealed class LiveEnquiryResponse
{
    public string WhatsAppNumber { get; set; } = string.Empty;
}

public sealed class UpdateLiveSettingsRequest
{
    public decimal PackagePrice { get; set; }
    public int HoursPerClassDay { get; set; }
    public string Language { get; set; } = string.Empty;
    public string Level { get; set; } = string.Empty;
    public string EnquiryWhatsApp { get; set; } = string.Empty;
    public List<AdminLiveSessionDto> Sessions { get; set; } = new();
}

public sealed class SetLiveWeekOverridesRequest
{
    /// <summary>Null clears the override and uses the studio price.</summary>
    public decimal? PriceOverride { get; set; }
    public string? LanguageOverride { get; set; }
    public string? LevelOverride { get; set; }
}

public sealed class SetLiveSlotHoursRequest
{
    /// <summary>Null or empty clears the override and uses the session's default hours.</summary>
    public string? Hours { get; set; }
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

/// <summary>An enquiry the admin confirmed outside the app. Price comes from the course.</summary>
public sealed class CreateLiveEnquiryRequest
{
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public Guid CourseId { get; set; }
    public Guid WeekId { get; set; }
    public LiveSlotType SlotType { get; set; }
    /// <summary>Class time the admin sets for this student, e.g. 10:00 AM – 12:00 PM. Not a default.</summary>
    public string ClassTime { get; set; } = string.Empty;
    public string PaymentReference { get; set; } = string.Empty;
}

public sealed class LiveEnquiryDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string CourseName { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public int WeekNumber { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    public string SlotName { get; set; } = string.Empty;
    public string SlotHours { get; set; } = string.Empty;
    public string PaymentReference { get; set; } = string.Empty;
    public DateTime? SentAt { get; set; }
    public DateTime CreatedAt { get; set; }
}

public sealed class SetLiveWeekTutorRequest
{
    public string TutorName { get; set; } = "SRI";
}
