using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VIVI.Api.DTOs.Live;
using VIVI.Api.Extensions;
using VIVI.Api.Services;
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
    private readonly CustomerResolver _customers;
    private readonly IBlobStorageService _blob;

    public LiveController(
        ViviDbContext db,
        LiveCalendarService calendar,
        LiveBookingService bookings,
        CustomerResolver customers,
        IBlobStorageService blob)
    {
        _db = db;
        _calendar = calendar;
        _bookings = bookings;
        _customers = customers;
        _blob = blob;
    }

    [HttpGet("weeks")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(IReadOnlyList<LiveWeekSummaryResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<LiveWeekSummaryResponse>>> ListWeeks(CancellationToken cancellationToken)
    {
        await _calendar.EnsureSeasonAsync(cancellationToken);
        await _bookings.ReleaseExpiredReservationsAsync(cancellationToken);

        var selectableStarts = _calendar.GetCustomerSelectableWeekStarts();
        var weeks = await _db.LiveWeeks
            .AsNoTracking()
            .Include(w => w.Slots)
            .OrderBy(w => w.StartDate)
            .ThenBy(w => w.WeekNumber)
            .ToListAsync(cancellationToken);

        // In-memory filter so current+next always applies even if EF cannot translate Contains.
        if (selectableStarts.Count > 0)
        {
            var allowed = selectableStarts.ToHashSet();
            weeks = weeks.Where(w => allowed.Contains(w.StartDate)).ToList();
        }
        else
        {
            // Full-season mode (tests): primary configured season only.
            // Production (count=2) uses the branch above and can span into the next season.
            var primaryYear = _calendar.PrimarySeasonYear;
            weeks = weeks.Where(w => w.SeasonYear == primaryYear).ToList();
        }

        var mapped = new List<LiveWeekSummaryResponse>(weeks.Count);
        foreach (var week in weeks)
            mapped.Add(await MapSummaryAsync(week, cancellationToken));
        return Ok(mapped);
    }

    [HttpGet("weeks/{weekId:guid}")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(LiveWeekDetailResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<LiveWeekDetailResponse>> GetWeek(Guid weekId, CancellationToken cancellationToken)
    {
        await _calendar.EnsureSeasonAsync(cancellationToken);
        await _bookings.ReleaseExpiredReservationsAsync(cancellationToken);

        var week = await _db.LiveWeeks
            .AsNoTracking()
            .Include(w => w.Slots)
            .SingleOrDefaultAsync(w => w.Id == weekId, cancellationToken)
            ?? throw ViviException.NotFound("LIVE_WEEK_NOT_FOUND", "Live week was not found.");

        return Ok(await MapDetailAsync(week, cancellationToken));
    }

    [HttpGet("weeks/{weekId:guid}/availability")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(LiveWeekDetailResponse), StatusCodes.Status200OK)]
    public Task<ActionResult<LiveWeekDetailResponse>> GetAvailability(Guid weekId, CancellationToken cancellationToken)
        => GetWeek(weekId, cancellationToken);

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
            cancellationToken);

        var week = await _db.LiveWeeks.AsNoTracking().SingleAsync(w => w.Id == request.WeekId, cancellationToken);
        return CreatedAtAction(nameof(GetBooking), new { id = result.Booking.Id }, new CreateLiveBookingResponse
        {
            BookingId = result.Booking.Id,
            OrderId = result.Order.Id,
            OrderNumber = result.Order.OrderNumber,
            RazorpayOrderId = result.RazorpayOrderId,
            RazorpayKeyId = result.RazorpayKeyId,
            AmountPaise = result.AmountPaise,
            Currency = result.Currency,
            TotalAmount = result.Order.TotalAmount,
            SlotName = _calendar.SlotName(request.SlotType),
            WeekNumber = week.WeekNumber,
            StartDate = week.StartDate,
            EndDate = week.EndDate
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

        return Ok(MapBooking(booking));
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
                && b.Week.EndDate >= today)
            .OrderBy(b => b.Week!.StartDate)
            .ThenByDescending(b => b.ConfirmedAt)
            .ToListAsync(cancellationToken);

        return Ok(bookings.Select(MapBooking).ToList());
    }

    private async Task<LiveWeekSummaryResponse> MapSummaryAsync(
        Core.Entities.LiveWeek week,
        CancellationToken cancellationToken)
    {
        var tutorPhotoUrl = await ProductImageResolver.ResolveAsync(
            week.TutorPhotoBlobPath,
            _blob,
            cancellationToken);
        return new LiveWeekSummaryResponse
        {
            Id = week.Id,
            WeekNumber = week.WeekNumber,
            SeasonYear = week.SeasonYear,
            StartDate = week.StartDate,
            EndDate = week.EndDate,
            IsBookable = week.IsBookable,
            PackagePrice = _calendar.PackagePrice,
            TutorName = string.IsNullOrWhiteSpace(week.TutorName) ? "SRI" : week.TutorName.Trim(),
            TutorPhotoUrl = tutorPhotoUrl,
            Slots = week.Slots.OrderBy(s => s.SlotType).Select(MapSlot).ToList()
        };
    }

    private async Task<LiveWeekDetailResponse> MapDetailAsync(
        Core.Entities.LiveWeek week,
        CancellationToken cancellationToken)
    {
        var summary = await MapSummaryAsync(week, cancellationToken);
        return new LiveWeekDetailResponse
        {
            Id = summary.Id,
            WeekNumber = summary.WeekNumber,
            SeasonYear = summary.SeasonYear,
            StartDate = summary.StartDate,
            EndDate = summary.EndDate,
            IsBookable = summary.IsBookable,
            PackagePrice = summary.PackagePrice,
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

    private LiveSlotAvailabilityResponse MapSlot(Core.Entities.LiveWeekSlot slot)
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
            Hours = _calendar.SlotHours(slot.SlotType),
            SeatCapacity = slot.SeatCapacity,
            SeatsBooked = slot.SeatsBooked,
            SeatsRemaining = slot.IsBlocked ? 0 : remaining,
            IsBlocked = slot.IsBlocked,
            Status = status
        };
    }

    private LiveBookingResponse MapBooking(Core.Entities.LiveBooking booking)
    {
        var week = booking.Week ?? throw ViviException.Conflict("LIVE_WEEK_MISSING", "Booking week is missing.");
        return new LiveBookingResponse
        {
            Id = booking.Id,
            OrderId = booking.OrderId,
            OrderNumber = booking.Order?.OrderNumber ?? string.Empty,
            Status = booking.Status.ToString(),
            SlotType = booking.SlotType.ToString(),
            SlotName = _calendar.SlotName(booking.SlotType),
            SlotHours = _calendar.SlotHours(booking.SlotType),
            WeekNumber = week.WeekNumber,
            StartDate = week.StartDate,
            EndDate = week.EndDate,
            PackagePrice = _calendar.PackagePrice,
            WeeklyLiveHours = _calendar.WeeklyLiveHours,
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
