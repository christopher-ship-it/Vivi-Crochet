using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VIVI.Api.DTOs.Live;
using VIVI.Api.Extensions;
using VIVI.Api.Mapping;
using VIVI.Api.Services;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Commerce;
using VIVI.Infrastructure.Data;

namespace VIVI.Api.Controllers;

[ApiController]
[Route("api/live")]
public sealed class LiveController : ControllerBase
{
    private readonly ViviDbContext _db;
    private readonly LiveCalendarService _calendar;
    private readonly LiveBookingService _bookings;
    private readonly LiveCourseService _courses;
    private readonly CustomerResolver _customers;
    private readonly IBlobStorageService _blob;

    public LiveController(
        ViviDbContext db,
        LiveCalendarService calendar,
        LiveBookingService bookings,
        LiveCourseService courses,
        CustomerResolver customers,
        IBlobStorageService blob)
    {
        _db = db;
        _calendar = calendar;
        _bookings = bookings;
        _courses = courses;
        _customers = customers;
        _blob = blob;
    }

    // shortcut: per-instance throttle, upgrade to a background job if seasons/holds need exact timing.
    private const long MaintenanceIntervalMs = 30_000;
    private static long _lastMaintenanceTick = long.MinValue;

    /// <summary>Season seeding and expired-hold release are idempotent; once per interval is enough for public reads.</summary>
    private async Task RunMaintenanceAsync(CancellationToken cancellationToken)
    {
        var now = Environment.TickCount64;
        var last = Interlocked.Read(ref _lastMaintenanceTick);
        // The static throttle must not leak across the in-memory databases used by tests.
        if (_db.Database.IsRelational() && last != long.MinValue && now - last < MaintenanceIntervalMs)
            return;

        Interlocked.Exchange(ref _lastMaintenanceTick, now);
        try
        {
            await _calendar.EnsureSeasonAsync(cancellationToken);
            await _bookings.ReleaseExpiredReservationsAsync(cancellationToken);
        }
        catch
        {
            Interlocked.Exchange(ref _lastMaintenanceTick, long.MinValue);
            throw;
        }
    }

    /// <summary>Where the Live page sends class enquiries; an empty number means no enquiry button.</summary>
    [HttpGet("enquiry")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(LiveEnquiryResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<LiveEnquiryResponse>> GetEnquiry(CancellationToken cancellationToken)
    {
        var settings = await _calendar.GetSettingsAsync(cancellationToken);
        return Ok(new LiveEnquiryResponse { WhatsAppNumber = settings.EnquiryWhatsApp });
    }

    /// <summary>The courses on sale: Basic, Intermediate, Advanced and the Artist pack that bundles them.</summary>
    [HttpGet("courses")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(IReadOnlyList<LiveCourseResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<LiveCourseResponse>>> ListCourses(CancellationToken cancellationToken)
    {
        var courses = await _courses.ListAsync(activeOnly: true, cancellationToken);
        return Ok(courses.Select(LiveCourseMapper.ToResponse).ToList());
    }

    /// <summary>
    /// Open weeks. With <paramref name="courseId"/>, a week is only open when every week the course
    /// runs is open, and each circle's seats are the fewest left across those weeks.
    /// </summary>
    [HttpGet("weeks")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(IReadOnlyList<LiveWeekSummaryResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<LiveWeekSummaryResponse>>> ListWeeks(
        [FromQuery] Guid? courseId,
        CancellationToken cancellationToken)
    {
        await RunMaintenanceAsync(cancellationToken);
        var course = await FindActiveCourseAsync(courseId, cancellationToken);

        var selectableStarts = _calendar.GetCustomerSelectableWeekStarts();
        var query = _db.LiveWeeks.AsNoTracking().Include(w => w.Slots).AsQueryable();
        if (selectableStarts.Count > 0)
        {
            // Range in SQL so only the selectable weeks are read; exact set applied below.
            var first = selectableStarts.Min();
            var last = selectableStarts.Max();
            query = query.Where(w => w.StartDate >= first && w.StartDate <= last);
        }
        else
        {
            // Full-season mode (tests): primary configured season only.
            // Production (count=2) uses the branch above and can span into the next season.
            var primaryYear = _calendar.PrimarySeasonYear;
            query = query.Where(w => w.SeasonYear == primaryYear);
        }

        var weeks = await query
            .OrderBy(w => w.StartDate)
            .ThenBy(w => w.WeekNumber)
            .ToListAsync(cancellationToken);

        if (selectableStarts.Count > 0)
        {
            var allowed = selectableStarts.ToHashSet();
            weeks = weeks.Where(w => allowed.Contains(w.StartDate)).ToList();
        }

        var byStart = await LoadCourseWeeksAsync(course, weeks, cancellationToken);
        var tutorDefault = await _calendar.GetOrCreateTutorDefaultAsync(cancellationToken);
        var mapped = new List<LiveWeekSummaryResponse>(weeks.Count);
        foreach (var week in weeks)
            mapped.Add(await MapSummaryAsync(week, tutorDefault, course, byStart, cancellationToken));
        return Ok(mapped);
    }

    [HttpGet("weeks/{weekId:guid}")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(LiveWeekDetailResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<LiveWeekDetailResponse>> GetWeek(
        Guid weekId,
        [FromQuery] Guid? courseId,
        CancellationToken cancellationToken)
    {
        await RunMaintenanceAsync(cancellationToken);
        var course = await FindActiveCourseAsync(courseId, cancellationToken);

        var week = await _db.LiveWeeks
            .AsNoTracking()
            .Include(w => w.Slots)
            .SingleOrDefaultAsync(w => w.Id == weekId, cancellationToken)
            ?? throw ViviException.NotFound("LIVE_WEEK_NOT_FOUND", "Live week was not found.");

        var byStart = await LoadCourseWeeksAsync(course, new[] { week }, cancellationToken);
        var tutorDefault = await _calendar.GetOrCreateTutorDefaultAsync(cancellationToken);
        return Ok(await MapDetailAsync(week, tutorDefault, course, byStart, cancellationToken));
    }

    [HttpGet("weeks/{weekId:guid}/availability")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(LiveWeekDetailResponse), StatusCodes.Status200OK)]
    public Task<ActionResult<LiveWeekDetailResponse>> GetAvailability(
        Guid weekId,
        [FromQuery] Guid? courseId,
        CancellationToken cancellationToken)
        => GetWeek(weekId, courseId, cancellationToken);

    [HttpPost("bookings")]
    [Authorize(Roles = nameof(UserRole.Customer))]
    [ProducesResponseType(typeof(CreateLiveBookingResponse), StatusCodes.Status201Created)]
    public async Task<ActionResult<CreateLiveBookingResponse>> CreateBooking(
        [FromBody] CreateLiveBookingRequest request,
        CancellationToken cancellationToken)
    {
        var customer = await _customers.ResolveForUserAsync(User.GetUserId(), cancellationToken);
        var result = await _bookings.CreateBookingCheckoutAsync(
            customer.Id,
            request.WeekId,
            request.SlotType,
            cancellationToken,
            request.CourseId);

        var week = await _db.LiveWeeks.AsNoTracking().SingleAsync(w => w.Id == request.WeekId, cancellationToken);
        var weeksHeld = result.Booking.WeeksHeld;
        return CreatedAtAction(nameof(GetBooking), new { id = result.Booking.Id }, new CreateLiveBookingResponse
        {
            BookingId = result.Booking.Id,
            OrderId = result.Order.Id,
            OrderNumber = result.Order.OrderNumber,
            PaymentProvider = result.Provider.ToString(),
            RazorpayOrderId = result.RazorpayOrderId ?? string.Empty,
            RazorpayKeyId = result.RazorpayKeyId ?? string.Empty,
            AmountPaise = result.AmountPaise,
            Currency = result.Currency,
            TotalAmount = result.Order.TotalAmount,
            SlotName = _calendar.SlotName(request.SlotType),
            WeekNumber = week.WeekNumber,
            StartDate = week.StartDate,
            EndDate = week.StartDate.AddDays(7 * weeksHeld - 1),
            CourseName = result.CourseName,
            WeeksHeld = weeksHeld
        });
    }

    [HttpGet("bookings/{id:guid}")]
    [Authorize(Roles = nameof(UserRole.Customer))]
    [ProducesResponseType(typeof(LiveBookingResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<LiveBookingResponse>> GetBooking(Guid id, CancellationToken cancellationToken)
    {
        var customer = await _customers.ResolveForUserAsync(User.GetUserId(), cancellationToken);
        var booking = await _db.LiveBookings
            .AsNoTracking()
            .Include(b => b.Week!)
            .ThenInclude(w => w.Slots)
            .Include(b => b.Order)
            .SingleOrDefaultAsync(b => b.Id == id, cancellationToken)
            ?? throw ViviException.NotFound("LIVE_BOOKING_NOT_FOUND", "Live booking was not found.");

        if (booking.CustomerId != customer.Id)
            throw ViviException.Forbidden("LIVE_BOOKING_FORBIDDEN", "You do not have access to this booking.");

        return Ok(MapBooking(booking, await CourseNamesAsync(cancellationToken)));
    }

    [HttpGet("me/bookings")]
    [Authorize(Roles = nameof(UserRole.Customer))]
    [ProducesResponseType(typeof(IReadOnlyList<LiveBookingResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<LiveBookingResponse>>> MyBookings(CancellationToken cancellationToken)
    {
        var customer = await _customers.ResolveForUserAsync(User.GetUserId(), cancellationToken);
        await _bookings.ReleaseExpiredReservationsAsync(cancellationToken);

        var today = _calendar.GetIndiaToday();
        var bookings = await _db.LiveBookings
            .AsNoTracking()
            .Include(b => b.Week!)
            .ThenInclude(w => w.Slots)
            .Include(b => b.Order)
            .Where(b =>
                b.CustomerId == customer.Id
                && b.Status == LiveBookingStatus.Confirmed
                && b.Week != null
                && b.Week.StartDate.AddDays(7 * b.WeeksHeld - 1) >= today)
            .OrderBy(b => b.Week!.StartDate)
            .ThenByDescending(b => b.ConfirmedAt)
            .ToListAsync(cancellationToken);

        var names = await CourseNamesAsync(cancellationToken);
        return Ok(bookings.Select(b => MapBooking(b, names)).ToList());
    }

    private async Task<LiveCourse?> FindActiveCourseAsync(Guid? courseId, CancellationToken cancellationToken)
    {
        if (courseId is not { } id)
            return null;

        await _courses.EnsureDefaultsAsync(cancellationToken);
        return await _db.LiveCourses.AsNoTracking()
                   .SingleOrDefaultAsync(c => c.Id == id && c.IsActive, cancellationToken)
               ?? throw ViviException.NotFound("LIVE_COURSE_NOT_FOUND", "Live course was not found.");
    }

    private async Task<IReadOnlyDictionary<Guid, string>> CourseNamesAsync(CancellationToken cancellationToken)
        => await _db.LiveCourses.AsNoTracking().ToDictionaryAsync(c => c.Id, c => c.Name, cancellationToken);

    /// <summary>
    /// For a course that runs several weeks: every week from the first shown week to the last
    /// week any of them touches, keyed by start date. Null for the single-week package.
    /// </summary>
    private async Task<IReadOnlyDictionary<DateOnly, LiveWeek>?> LoadCourseWeeksAsync(
        LiveCourse? course,
        IReadOnlyCollection<LiveWeek> shown,
        CancellationToken cancellationToken)
    {
        if (course is null || shown.Count == 0)
            return null;

        var first = shown.Min(w => w.StartDate);
        var last = shown.Max(w => w.StartDate).AddDays(7 * (Math.Max(1, course.WeeksSpan) - 1));
        var weeks = await _db.LiveWeeks
            .AsNoTracking()
            .Include(w => w.Slots)
            .Where(w => w.StartDate >= first && w.StartDate <= last)
            .ToListAsync(cancellationToken);
        return weeks.ToDictionary(w => w.StartDate);
    }

    private async Task<LiveWeekSummaryResponse> MapSummaryAsync(
        LiveWeek week,
        LiveTutorDefault tutorDefault,
        LiveCourse? course,
        IReadOnlyDictionary<DateOnly, LiveWeek>? byStart,
        CancellationToken cancellationToken)
    {
        var (tutorName, tutorPhotoBlobPath) = LiveCalendarService.ResolveEffectiveTutor(week, tutorDefault);
        var tutorPhotoUrl = await ProductImageResolver.ResolveAsync(
            tutorPhotoBlobPath,
            _blob,
            cancellationToken);

        // The weeks this booking would hold; a missing week makes the whole run unavailable.
        var span = course is null || byStart is null
            ? null
            : Enumerable.Range(0, Math.Max(1, course.WeeksSpan))
                .Select(i => byStart.GetValueOrDefault(week.StartDate.AddDays(7 * i)))
                .ToList();
        var complete = span is null || span.All(w => w is not null);

        return new LiveWeekSummaryResponse
        {
            Id = week.Id,
            WeekNumber = week.WeekNumber,
            SeasonYear = week.SeasonYear,
            StartDate = week.StartDate,
            EndDate = week.EndDate,
            IsBookable = week.IsBookable && complete && (span is null || span.All(w => w!.IsBookable)),
            PackagePrice = course?.Price ?? _calendar.PriceFor(week),
            Language = _calendar.LanguageFor(week),
            Level = _calendar.LevelFor(week),
            TutorName = tutorName,
            TutorPhotoUrl = tutorPhotoUrl,
            // Switched-off additional sessions are hidden from customers.
            Slots = week.Slots
                .Where(s => _calendar.IsSlotEnabled(s.SlotType))
                .OrderBy(s => s.SlotType)
                .Select(s => span is null
                    ? MapSlot(s)
                    : MapSlotAcross(s, span.Select(w => w?.Slots.FirstOrDefault(x => x.SlotType == s.SlotType)).ToList()))
                .ToList()
        };
    }

    private async Task<LiveWeekDetailResponse> MapDetailAsync(
        LiveWeek week,
        LiveTutorDefault tutorDefault,
        LiveCourse? course,
        IReadOnlyDictionary<DateOnly, LiveWeek>? byStart,
        CancellationToken cancellationToken)
    {
        var summary = await MapSummaryAsync(week, tutorDefault, course, byStart, cancellationToken);
        return new LiveWeekDetailResponse
        {
            Id = summary.Id,
            WeekNumber = summary.WeekNumber,
            SeasonYear = summary.SeasonYear,
            StartDate = summary.StartDate,
            EndDate = summary.EndDate,
            IsBookable = summary.IsBookable,
            PackagePrice = summary.PackagePrice,
            Language = summary.Language,
            Level = summary.Level,
            TutorName = summary.TutorName,
            TutorPhotoUrl = summary.TutorPhotoUrl,
            Slots = summary.Slots,
            WeeklyLiveHours = _calendar.WeeklyLiveHours,
            HoursPerClassDay = _calendar.HoursPerClassDay,
            Days = _calendar.BuildDayPlan(week).Select(d => new LiveDayResponse
            {
                Date = d.Date,
                Weekday = d.Weekday.ToString().ToUpperInvariant()[..3],
                Kind = d.Kind.ToString(),
                Label = d.Label
            }).ToList()
        };
    }

    private LiveSlotAvailabilityResponse MapSlot(LiveWeekSlot slot)
    {
        var remaining = Math.Max(0, slot.SeatCapacity - slot.SeatsBooked);
        var status = slot.IsBlocked
            ? "Blocked"
            : remaining == 0
                ? "FullyBooked"
                : "Available";
        return new LiveSlotAvailabilityResponse
        {
            SlotType = slot.SlotType.ToString(),
            Name = _calendar.SlotName(slot.SlotType),
            Hours = _calendar.SlotHoursFor(slot),
            SeatCapacity = slot.SeatCapacity,
            SeatsBooked = slot.SeatsBooked,
            SeatsRemaining = slot.IsBlocked ? 0 : remaining,
            IsBlocked = slot.IsBlocked,
            Status = status
        };
    }

    /// <summary>One circle across every week a course runs: blocked if any week is, fullest week decides the seats.</summary>
    private LiveSlotAvailabilityResponse MapSlotAcross(LiveWeekSlot first, IReadOnlyList<LiveWeekSlot?> across)
    {
        var missing = across.Any(s => s is null);
        var blocked = missing || across.Any(s => s!.IsBlocked);
        var fullest = missing
            ? first
            : across.OrderBy(s => s!.SeatCapacity - s.SeatsBooked).First()!;
        var remaining = blocked ? 0 : Math.Max(0, fullest.SeatCapacity - fullest.SeatsBooked);
        return new LiveSlotAvailabilityResponse
        {
            SlotType = first.SlotType.ToString(),
            Name = _calendar.SlotName(first.SlotType),
            Hours = _calendar.SlotHoursFor(first),
            SeatCapacity = fullest.SeatCapacity,
            SeatsBooked = fullest.SeatsBooked,
            SeatsRemaining = remaining,
            IsBlocked = blocked,
            Status = blocked ? "Blocked" : remaining == 0 ? "FullyBooked" : "Available"
        };
    }

    private LiveBookingResponse MapBooking(LiveBooking booking, IReadOnlyDictionary<Guid, string> courseNames)
    {
        var week = booking.Week ?? throw ViviException.Conflict("LIVE_WEEK_MISSING", "Booking week is missing.");
        var weeksHeld = Math.Max(1, booking.WeeksHeld);
        return new LiveBookingResponse
        {
            Id = booking.Id,
            OrderId = booking.OrderId,
            OrderNumber = booking.Order?.OrderNumber ?? string.Empty,
            Status = booking.Status.ToString(),
            SlotType = booking.SlotType.ToString(),
            SlotName = _calendar.SlotName(booking.SlotType),
            SlotHours = booking.Week?.Slots.FirstOrDefault(s => s.SlotType == booking.SlotType) is { } bookedSlot
                ? _calendar.SlotHoursFor(bookedSlot)
                : _calendar.SlotHours(booking.SlotType),
            WeekNumber = week.WeekNumber,
            StartDate = week.StartDate,
            EndDate = week.StartDate.AddDays(7 * weeksHeld - 1),
            // What the customer actually paid; falls back to the week price for older rows.
            PackagePrice = booking.Order?.TotalAmount ?? _calendar.PriceFor(week),
            WeeklyLiveHours = _calendar.WeeklyLiveHours,
            CourseName = booking.CourseId is { } courseId ? courseNames.GetValueOrDefault(courseId) : null,
            WeeksHeld = weeksHeld,
            Days = _calendar.BuildDayPlan(week).Select(d => new LiveDayResponse
            {
                Date = d.Date,
                Weekday = d.Weekday.ToString().ToUpperInvariant()[..3],
                Kind = d.Kind.ToString(),
                Label = d.Label
            }).ToList(),
            ConfirmedAt = booking.ConfirmedAt
        };
    }
}
