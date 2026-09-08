using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VIVI.Api.DTOs.Live;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Infrastructure.Commerce;
using VIVI.Infrastructure.Data;

namespace VIVI.Api.Controllers;

[ApiController]
[Route("api/admin/live")]
[Authorize(Roles = nameof(UserRole.Admin))]
public sealed class AdminLiveController : ControllerBase
{
    private readonly ViviDbContext _db;
    private readonly LiveCalendarService _calendar;
    private readonly LiveBookingService _bookings;

    public AdminLiveController(
        ViviDbContext db,
        LiveCalendarService calendar,
        LiveBookingService bookings)
    {
        _db = db;
        _calendar = calendar;
        _bookings = bookings;
    }

    [HttpPost("ensure-season")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> EnsureSeason(CancellationToken cancellationToken)
    {
        await _calendar.EnsureSeasonAsync(cancellationToken);
        return NoContent();
    }

    [HttpGet("weeks")]
    [ProducesResponseType(typeof(IReadOnlyList<AdminLiveWeekResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<AdminLiveWeekResponse>>> ListWeeks(CancellationToken cancellationToken)
    {
        await _calendar.EnsureSeasonAsync(cancellationToken);
        await _bookings.ReleaseExpiredReservationsAsync(cancellationToken);

        var weeks = await _db.LiveWeeks
            .AsNoTracking()
            .Include(w => w.Slots)
            .OrderBy(w => w.SeasonYear)
            .ThenBy(w => w.WeekNumber)
            .ToListAsync(cancellationToken);

        return Ok(weeks.Select(MapWeek).ToList());
    }

    [HttpPut("weeks/{weekId:guid}/break")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> SetBreak(
        Guid weekId,
        [FromBody] SetLiveWeekBreakRequest request,
        CancellationToken cancellationToken)
    {
        await _calendar.SetBreakAsync(weekId, request.BreakWeekday, cancellationToken);
        return NoContent();
    }

    [HttpPut("weeks/{weekId:guid}/bookable")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> SetBookable(
        Guid weekId,
        [FromBody] SetLiveWeekBookableRequest request,
        CancellationToken cancellationToken)
    {
        await _calendar.SetBookableAsync(weekId, request.IsBookable, cancellationToken);
        return NoContent();
    }

    [HttpPut("weeks/{weekId:guid}/slots/{slotType}/capacity")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> SetSlotCapacity(
        Guid weekId,
        LiveSlotType slotType,
        [FromBody] SetLiveSlotCapacityRequest request,
        CancellationToken cancellationToken)
    {
        await _calendar.SetSlotCapacityAsync(weekId, slotType, request.SeatCapacity, cancellationToken);
        return NoContent();
    }

    [HttpGet("bookings")]
    [ProducesResponseType(typeof(IReadOnlyList<AdminLiveBookingListItemResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<AdminLiveBookingListItemResponse>>> ListBookings(
        [FromQuery] LiveBookingStatus? status,
        [FromQuery] int? weekNumber,
        [FromQuery] int? seasonYear,
        [FromQuery] LiveSlotType? slotType,
        CancellationToken cancellationToken)
    {
        await _bookings.ReleaseExpiredReservationsAsync(cancellationToken);

        var query = _db.LiveBookings
            .AsNoTracking()
            .Include(b => b.Customer)
            .Include(b => b.Week)
            .Include(b => b.Order!)
            .ThenInclude(o => o.Payments)
            .AsQueryable();

        if (status.HasValue)
            query = query.Where(b => b.Status == status.Value);
        if (weekNumber.HasValue)
            query = query.Where(b => b.Week != null && b.Week.WeekNumber == weekNumber.Value);
        if (seasonYear.HasValue)
            query = query.Where(b => b.Week != null && b.Week.SeasonYear == seasonYear.Value);
        if (slotType.HasValue)
            query = query.Where(b => b.SlotType == slotType.Value);

        var bookings = await query
            .OrderByDescending(b => b.CreatedAt)
            .Take(200)
            .ToListAsync(cancellationToken);

        return Ok(bookings.Select(MapListItem).ToList());
    }

    [HttpGet("bookings/{id:guid}")]
    [ProducesResponseType(typeof(AdminLiveBookingDetailResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminLiveBookingDetailResponse>> GetBooking(
        Guid id,
        CancellationToken cancellationToken)
    {
        await _bookings.ReleaseExpiredReservationsAsync(cancellationToken);

        var booking = await _db.LiveBookings
            .AsNoTracking()
            .Include(b => b.Customer)
            .Include(b => b.Week!)
            .ThenInclude(w => w.Slots)
            .Include(b => b.Order!)
            .ThenInclude(o => o.Payments)
            .SingleOrDefaultAsync(b => b.Id == id, cancellationToken)
            ?? throw ViviException.NotFound("LIVE_BOOKING_NOT_FOUND", "Live booking was not found.");

        return Ok(MapDetail(booking));
    }

    [HttpPost("bookings/{id:guid}/cancel")]
    [ProducesResponseType(typeof(AdminLiveBookingDetailResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminLiveBookingDetailResponse>> CancelBooking(
        Guid id,
        CancellationToken cancellationToken)
    {
        await _bookings.AdminCancelBookingAsync(id, cancellationToken);

        var booking = await _db.LiveBookings
            .AsNoTracking()
            .Include(b => b.Customer)
            .Include(b => b.Week!)
            .ThenInclude(w => w.Slots)
            .Include(b => b.Order!)
            .ThenInclude(o => o.Payments)
            .SingleAsync(b => b.Id == id, cancellationToken);

        return Ok(MapDetail(booking));
    }

    private AdminLiveWeekResponse MapWeek(Core.Entities.LiveWeek week) => new()
    {
        Id = week.Id,
        WeekNumber = week.WeekNumber,
        SeasonYear = week.SeasonYear,
        StartDate = week.StartDate,
        EndDate = week.EndDate,
        BreakWeekday = week.BreakWeekday?.ToString(),
        IsBookable = week.IsBookable,
        PackagePrice = _calendar.PackagePrice,
        Slots = week.Slots.OrderBy(s => s.SlotType).Select(MapSlot).ToList()
    };

    private LiveSlotAvailabilityResponse MapSlot(Core.Entities.LiveWeekSlot slot)
    {
        var remaining = Math.Max(0, slot.SeatCapacity - slot.SeatsBooked);
        return new LiveSlotAvailabilityResponse
        {
            SlotType = slot.SlotType.ToString(),
            Name = _calendar.SlotName(slot.SlotType),
            SeatCapacity = slot.SeatCapacity,
            SeatsBooked = slot.SeatsBooked,
            SeatsRemaining = remaining,
            Status = remaining == 0 ? "FullyBooked" : "Available"
        };
    }

    private AdminLiveBookingListItemResponse MapListItem(Core.Entities.LiveBooking booking)
    {
        var week = booking.Week ?? throw ViviException.Conflict("LIVE_WEEK_MISSING", "Booking week is missing.");
        var payment = booking.Order?.Payments.OrderByDescending(p => p.CreatedAt).FirstOrDefault();
        return new AdminLiveBookingListItemResponse
        {
            Id = booking.Id,
            Status = booking.Status.ToString(),
            CustomerName = booking.Customer?.FullName ?? string.Empty,
            CustomerPhone = booking.Customer?.PhoneNumber ?? string.Empty,
            CustomerEmail = booking.Customer?.Email ?? string.Empty,
            WeekNumber = week.WeekNumber,
            SeasonYear = week.SeasonYear,
            StartDate = week.StartDate,
            EndDate = week.EndDate,
            SlotType = booking.SlotType.ToString(),
            SlotName = _calendar.SlotName(booking.SlotType),
            OrderId = booking.OrderId,
            OrderNumber = booking.Order?.OrderNumber ?? string.Empty,
            TotalAmount = booking.Order?.TotalAmount ?? _calendar.PackagePrice,
            PaymentStatus = payment?.Status.ToString(),
            CreatedAt = booking.CreatedAt,
            ConfirmedAt = booking.ConfirmedAt
        };
    }

    private AdminLiveBookingDetailResponse MapDetail(Core.Entities.LiveBooking booking)
    {
        var list = MapListItem(booking);
        var week = booking.Week!;
        var slot = week.Slots.SingleOrDefault(s => s.SlotType == booking.SlotType);
        var remaining = slot is null ? 0 : Math.Max(0, slot.SeatCapacity - slot.SeatsBooked);

        return new AdminLiveBookingDetailResponse
        {
            Id = list.Id,
            Status = list.Status,
            CustomerName = list.CustomerName,
            CustomerPhone = list.CustomerPhone,
            CustomerEmail = list.CustomerEmail,
            WeekNumber = list.WeekNumber,
            SeasonYear = list.SeasonYear,
            StartDate = list.StartDate,
            EndDate = list.EndDate,
            SlotType = list.SlotType,
            SlotName = list.SlotName,
            OrderId = list.OrderId,
            OrderNumber = list.OrderNumber,
            TotalAmount = list.TotalAmount,
            PaymentStatus = list.PaymentStatus,
            CreatedAt = list.CreatedAt,
            ConfirmedAt = list.ConfirmedAt,
            ReservationExpiresAt = booking.ReservationExpiresAt,
            SeatCapacity = slot?.SeatCapacity ?? 0,
            SeatsBooked = slot?.SeatsBooked ?? 0,
            SeatsRemaining = remaining,
            BreakWeekday = week.BreakWeekday?.ToString(),
            IsBookable = week.IsBookable,
            Days = _calendar.BuildDayPlan(week).Select(d => new LiveDayResponse
            {
                Date = d.Date,
                Weekday = d.Weekday.ToString().ToUpperInvariant()[..3],
                Kind = d.Kind.ToString(),
                Label = d.Label
            }).ToList()
        };
    }
}
