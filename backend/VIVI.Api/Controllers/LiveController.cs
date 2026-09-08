using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VIVI.Api.DTOs.Live;
using VIVI.Api.Extensions;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
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

    public LiveController(
        ViviDbContext db,
        LiveCalendarService calendar,
        LiveBookingService bookings,
        CustomerResolver customers)
    {
        _db = db;
        _calendar = calendar;
        _bookings = bookings;
        _customers = customers;
    }

    [HttpGet("weeks")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(IReadOnlyList<LiveWeekSummaryResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<LiveWeekSummaryResponse>>> ListWeeks(CancellationToken cancellationToken)
    {
        await _calendar.EnsureSeasonAsync(cancellationToken);
        await _bookings.ReleaseExpiredReservationsAsync(cancellationToken);

        var weeks = await _db.LiveWeeks
            .AsNoTracking()
            .Include(w => w.Slots)
            .OrderBy(w => w.WeekNumber)
            .ToListAsync(cancellationToken);

        return Ok(weeks.Select(MapSummary).ToList());
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

        return Ok(MapDetail(week));
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

        var bookings = await _db.LiveBookings
            .AsNoTracking()
            .Include(b => b.Week!)
            .ThenInclude(w => w.Slots)
            .Include(b => b.Order)
            .Where(b => b.CustomerId == customer.Id && b.Status == LiveBookingStatus.Confirmed)
            .OrderByDescending(b => b.ConfirmedAt)
            .ToListAsync(cancellationToken);

        return Ok(bookings.Select(MapBooking).ToList());
    }

    private LiveWeekSummaryResponse MapSummary(Core.Entities.LiveWeek week) => new()
    {
        Id = week.Id,
        WeekNumber = week.WeekNumber,
        SeasonYear = week.SeasonYear,
        StartDate = week.StartDate,
        EndDate = week.EndDate,
        IsBookable = week.IsBookable,
        PackagePrice = _calendar.PackagePrice,
        Slots = week.Slots.OrderBy(s => s.SlotType).Select(MapSlot).ToList()
    };

    private LiveWeekDetailResponse MapDetail(Core.Entities.LiveWeek week)
    {
        var summary = MapSummary(week);
        return new LiveWeekDetailResponse
        {
            Id = summary.Id,
            WeekNumber = summary.WeekNumber,
            SeasonYear = summary.SeasonYear,
            StartDate = summary.StartDate,
            EndDate = summary.EndDate,
            IsBookable = summary.IsBookable,
            PackagePrice = summary.PackagePrice,
            Slots = summary.Slots,
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
        var fullyBooked = remaining == 0;
        return new LiveSlotAvailabilityResponse
        {
            SlotType = slot.SlotType.ToString(),
            Name = _calendar.SlotName(slot.SlotType),
            SeatCapacity = slot.SeatCapacity,
            SeatsBooked = slot.SeatsBooked,
            SeatsRemaining = remaining,
            Status = fullyBooked ? "FullyBooked" : "Available"
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
            WeekNumber = week.WeekNumber,
            StartDate = week.StartDate,
            EndDate = week.EndDate,
            PackagePrice = _calendar.PackagePrice,
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
