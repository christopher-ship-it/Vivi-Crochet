using System.Collections.Concurrent;
using System.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using VIVI.Core;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Auth;
using VIVI.Infrastructure.Configuration;
using VIVI.Infrastructure.Data;

namespace VIVI.Infrastructure.Commerce;

public sealed record LiveCheckoutResult(
    LiveBooking Booking,
    Order Order,
    PaymentProvider Provider,
    string? RazorpayOrderId,
    string? RazorpayKeyId,
    int AmountPaise,
    string Currency,
    string? CourseName = null);

public sealed class LiveBookingService
{
    private static readonly ConcurrentDictionary<string, SemaphoreSlim> SeatGates = new();

    private readonly ViviDbContext _db;
    private readonly LiveCalendarService _calendar;
    private readonly LiveStudioOptions _options;
    private readonly IRazorpayPaymentGateway _razorpay;
    private readonly RazorpayOptionsAccessor _razorpayOptions;

    public LiveBookingService(
        ViviDbContext db,
        LiveCalendarService calendar,
        IOptions<LiveStudioOptions> options,
        IRazorpayPaymentGateway razorpay,
        RazorpayOptionsAccessor razorpayOptions)
    {
        _db = db;
        _calendar = calendar;
        _options = options.Value;
        _razorpay = razorpay;
        _razorpayOptions = razorpayOptions;
    }

    public async Task ReleaseExpiredReservationsAsync(CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var expired = await _db.LiveBookings
            .Include(b => b.Order)
            .Where(b =>
                b.Status == LiveBookingStatus.PendingPayment
                && b.ReservationExpiresAt != null
                && b.ReservationExpiresAt < now)
            .ToListAsync(cancellationToken);

        foreach (var booking in expired)
        {
            await ReleaseSeatHoldAsync(booking, cancellationToken);
            booking.Status = LiveBookingStatus.Expired;
            booking.UpdatedAt = now;
            if (booking.Order is not null && booking.Order.Status == OrderStatus.PendingPayment)
            {
                booking.Order.Status = OrderStatus.Cancelled;
                booking.Order.UpdatedAt = now;
            }
        }

        if (expired.Count > 0)
            await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task ConfirmBookingForOrderAsync(Order order, CancellationToken cancellationToken)
    {
        var booking = await _db.LiveBookings
            .SingleOrDefaultAsync(b => b.OrderId == order.Id, cancellationToken);
        if (booking is null)
            return;

        if (booking.Status == LiveBookingStatus.Confirmed)
            return;

        booking.Status = LiveBookingStatus.Confirmed;
        booking.ConfirmedAt = DateTime.UtcNow;
        booking.ReservationExpiresAt = null;
        booking.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task ReleaseSeatIfPendingAsync(Guid orderId, CancellationToken cancellationToken)
    {
        var booking = await _db.LiveBookings
            .SingleOrDefaultAsync(b => b.OrderId == orderId && b.Status == LiveBookingStatus.PendingPayment, cancellationToken);
        if (booking is null)
            return;

        await ReleaseSeatHoldAsync(booking, cancellationToken);
        booking.Status = LiveBookingStatus.Cancelled;
        booking.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>
    /// Admin may release PendingPayment holds. Confirmed bookings cannot be cancelled
    /// (final studio rule: once booked, the class seat is final).
    /// </summary>
    public async Task AdminCancelBookingAsync(Guid bookingId, CancellationToken cancellationToken)
    {
        var booking = await _db.LiveBookings
            .Include(b => b.Order)
            .SingleOrDefaultAsync(b => b.Id == bookingId, cancellationToken)
            ?? throw ViviException.NotFound("LIVE_BOOKING_NOT_FOUND", "Live booking was not found.");

        if (booking.Status is LiveBookingStatus.Cancelled or LiveBookingStatus.Expired)
            return;

        if (booking.Status == LiveBookingStatus.Confirmed)
        {
            throw ViviException.Conflict(
                "LIVE_BOOKING_CONFIRMED_NO_CANCEL",
                "Confirmed live bookings cannot be cancelled.");
        }

        if (booking.Status is not LiveBookingStatus.PendingPayment)
            throw ViviException.Conflict("LIVE_BOOKING_NOT_CANCELLABLE", "This booking cannot be cancelled.");

        var now = DateTime.UtcNow;
        await ReleaseSeatHoldAsync(booking, cancellationToken);
        booking.Status = LiveBookingStatus.Cancelled;
        booking.ReservationExpiresAt = null;
        booking.UpdatedAt = now;

        if (booking.Order is not null && booking.Order.Status == OrderStatus.PendingPayment)
        {
            booking.Order.Status = OrderStatus.Cancelled;
            booking.Order.UpdatedAt = now;
        }

        await _db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>
    /// Books a week and circle. With a <paramref name="courseId"/> the booking is priced from that
    /// course and holds a seat in the same circle for every week the course runs; without one it is
    /// the original single-week package.
    /// </summary>
    public Task<LiveCheckoutResult> CreateBookingCheckoutAsync(
        Guid customerId,
        Guid weekId,
        LiveSlotType slotType,
        CancellationToken cancellationToken,
        Guid? courseId = null)
        => _db.RunRetryableAsync(() => CreateBookingCheckoutCoreAsync(customerId, weekId, slotType, courseId, cancellationToken));

    private async Task<LiveCheckoutResult> CreateBookingCheckoutCoreAsync(
        Guid customerId,
        Guid weekId,
        LiveSlotType slotType,
        Guid? courseId,
        CancellationToken cancellationToken)
    {
        await _calendar.EnsureSeasonAsync(cancellationToken);
        await ReleaseExpiredReservationsAsync(cancellationToken);

        LiveCourse? course = null;
        if (courseId is { } requestedCourseId)
        {
            course = await _db.LiveCourses.AsNoTracking()
                .SingleOrDefaultAsync(c => c.Id == requestedCourseId, cancellationToken)
                ?? throw ViviException.NotFound("LIVE_COURSE_NOT_FOUND", "Live course was not found.");
            if (!course.IsActive)
                throw ViviException.Conflict("COURSE_NOT_AVAILABLE", "This course is not open for booking.");
        }

        var span = Math.Max(1, course?.WeeksSpan ?? 1);
        // An unknown week is reported once the customer checks below have passed.
        var knownStart = await _db.LiveWeeks
            .Where(w => w.Id == weekId)
            .Select(w => (DateOnly?)w.StartDate)
            .SingleOrDefaultAsync(cancellationToken);
        var startDate = knownStart ?? default;
        var lastStart = startDate.AddDays(7 * (span - 1));

        // Every week the booking holds is locked, always in the same order, so two multi-week
        // bookings can never wait on each other.
        var gateKeys = knownStart is null
            ? new List<string>()
            : (await _db.LiveWeeks
                    .Where(w => w.StartDate >= startDate && w.StartDate <= lastStart)
                    .Select(w => w.Id)
                    .ToListAsync(cancellationToken))
                .Select(id => $"{id:N}:{slotType}")
                .OrderBy(k => k, StringComparer.Ordinal)
                .ToList();
        var held = new List<SemaphoreSlim>();
        try
        {
            foreach (var key in gateKeys)
            {
                var gate = SeatGates.GetOrAdd(key, _ => new SemaphoreSlim(1, 1));
                await gate.WaitAsync(cancellationToken);
                held.Add(gate);
            }

            await using var transaction = _db.Database.IsRelational()
                ? await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken)
                : null;

            var customer = await _db.Customers
                .SingleOrDefaultAsync(c => c.Id == customerId, cancellationToken)
                ?? throw ViviException.NotFound("CUSTOMER_NOT_FOUND", "Customer was not found.");

            if (!Markets.For(Markets.EffectiveCountry(customer.AuthMethod, customer.CountryCode)).CanBookLiveClasses)
            {
                throw ViviException.Conflict(
                    "LIVE_NOT_AVAILABLE_IN_COUNTRY",
                    "Live classes are available in India only.");
            }

            var email = CustomerAccountService.NormalizeEmail(customer.Email);
            if (string.IsNullOrWhiteSpace(email)
                || email.EndsWith("@vivicrochet.dev", StringComparison.OrdinalIgnoreCase)
                || customer.EmailVerifiedAt is null)
            {
                throw ViviException.Conflict(
                    "EMAIL_VERIFICATION_REQUIRED",
                    "Add and verify your email before booking a live class.");
            }

            if (knownStart is null)
                throw ViviException.NotFound("LIVE_WEEK_NOT_FOUND", "Live week was not found.");

            var weeks = await _db.LiveWeeks
                .Include(w => w.Slots)
                .Where(w => w.StartDate >= startDate && w.StartDate <= lastStart)
                .OrderBy(w => w.StartDate)
                .ToListAsync(cancellationToken);
            var week = weeks.FirstOrDefault(w => w.Id == weekId)
                ?? throw ViviException.NotFound("LIVE_WEEK_NOT_FOUND", "Live week was not found.");

            if (!week.IsBookable)
                throw ViviException.Conflict("WEEK_NOT_BOOKABLE", "This week is not open for booking.");

            if (!_calendar.IsCustomerSelectableWeek(week))
                throw ViviException.Conflict(
                    "WEEK_OUTSIDE_WINDOW",
                    "You can only book an upcoming open live week.");

            if (weeks.Count < span)
                throw ViviException.Conflict(
                    "COURSE_WEEKS_UNAVAILABLE",
                    $"This course needs {span} weeks in a row from the week you chose, and they are not all scheduled yet.");

            // Validate schedule (Sunday never bookable; replacement rules).
            foreach (var w in weeks)
            {
                _ = _calendar.BuildDayPlan(w);
                if (!w.IsBookable)
                    throw ViviException.Conflict(
                        "WEEK_NOT_BOOKABLE",
                        $"Week {w.WeekNumber} of this course is not open for booking.");
            }

            // The same circle cannot be booked twice for overlapping weeks.
            var mine = await _db.LiveBookings
                .AsNoTracking()
                .Where(b =>
                    b.CustomerId == customerId
                    && b.SlotType == slotType
                    && b.Week != null
                    && (b.Status == LiveBookingStatus.Confirmed || b.Status == LiveBookingStatus.PendingPayment))
                .Select(b => new { b.Week!.StartDate, b.WeeksHeld })
                .ToListAsync(cancellationToken);
            var duplicate = mine.Any(b =>
                b.StartDate <= lastStart
                && b.StartDate.AddDays(7 * Math.Max(1, b.WeeksHeld) - 1) >= startDate);
            if (duplicate)
                throw ViviException.Conflict("ALREADY_BOOKED", "You already booked this week and slot.");

            await _calendar.GetSettingsAsync(cancellationToken);
            var slots = new List<LiveWeekSlot>(weeks.Count);
            foreach (var w in weeks)
            {
                var slot = w.Slots.SingleOrDefault(s => s.SlotType == slotType)
                    ?? throw ViviException.NotFound("LIVE_SLOT_NOT_FOUND", "Live slot was not found.");

                var where = w.Id == weekId ? string.Empty : $" (week {w.WeekNumber} of this course)";
                if (!_calendar.IsSlotEnabled(slotType))
                    throw ViviException.Conflict("SLOT_NOT_AVAILABLE", "This session is not available.");

                if (slot.IsBlocked)
                    throw ViviException.Conflict("SLOT_BLOCKED", $"This slot is blocked by the studio{where}.");

                if (slot.SeatsBooked >= slot.SeatCapacity)
                    throw ViviException.Conflict("FULLY_BOOKED", $"This slot is fully booked{where}.");

                slots.Add(slot);
            }

            var now = DateTime.UtcNow;
            foreach (var slot in slots)
            {
                slot.SeatsBooked += 1;
                slot.UpdatedAt = now;
            }

            // Price is read now and stored on the order, so later price changes never touch it.
            var price = course?.Price ?? _calendar.PriceFor(week);
            var slotName = _calendar.SlotName(slotType);
            var weekLabel = span > 1
                ? $"Weeks {week.WeekNumber}–{weeks[^1].WeekNumber}"
                : $"Week {week.WeekNumber}";
            var order = new Order
            {
                Id = Guid.NewGuid(),
                OrderNumber = await GenerateOrderNumberAsync(cancellationToken),
                CustomerId = customerId,
                Status = OrderStatus.PendingPayment,
                Currency = "INR",
                Subtotal = price,
                DiscountAmount = 0,
                TaxAmount = 0,
                ShippingAmount = 0,
                TotalAmount = price,
                CreatedAt = now,
                UpdatedAt = now
            };

            var orderItem = new OrderItem
            {
                Id = Guid.NewGuid(),
                OrderId = order.Id,
                ItemType = OrderItemType.LivePackage,
                LiveWeekId = week.Id,
                LiveSlotType = slotType,
                Quantity = 1,
                UnitPrice = price,
                DiscountAmount = 0,
                TotalAmount = price,
                ItemNameSnapshot = course is null
                    ? $"{slotName} · {weekLabel}"
                    : $"{course.Name} · {slotName} · {weekLabel}"
            };
            order.Items.Add(orderItem);

            var amountPaise = (int)Math.Round(price * 100m, MidpointRounding.AwayFromZero);
            var razorpayOrder = await _razorpay.CreateOrderAsync(
                order.OrderNumber,
                amountPaise,
                order.Currency,
                cancellationToken);
            order.RazorpayOrderId = razorpayOrder.RazorpayOrderId;
            var payment = new Payment
            {
                Id = Guid.NewGuid(),
                OrderId = order.Id,
                Provider = PaymentProvider.Razorpay,
                ProviderOrderId = razorpayOrder.RazorpayOrderId,
                Amount = price,
                Currency = "INR",
                Status = PaymentStatus.Created,
                CreatedAt = now,
                UpdatedAt = now
            };

            var booking = new LiveBooking
            {
                Id = Guid.NewGuid(),
                CustomerId = customerId,
                LiveWeekId = week.Id,
                SlotType = slotType,
                CourseId = course?.Id,
                WeeksHeld = span,
                OrderId = order.Id,
                OrderItemId = orderItem.Id,
                Status = LiveBookingStatus.PendingPayment,
                ReservationExpiresAt = now.AddMinutes(_options.ReservationMinutes),
                CreatedAt = now,
                UpdatedAt = now
            };

            _db.Orders.Add(order);
            _db.Payments.Add(payment);
            _db.LiveBookings.Add(booking);
            await _db.SaveChangesAsync(cancellationToken);
            if (transaction is not null)
                await transaction.CommitAsync(cancellationToken);

            return new LiveCheckoutResult(
                booking,
                order,
                PaymentProvider.Razorpay,
                RazorpayOrderId: razorpayOrder.RazorpayOrderId,
                RazorpayKeyId: _razorpayOptions.KeyId,
                amountPaise,
                order.Currency,
                course?.Name);
        }
        finally
        {
            foreach (var gate in held)
                gate.Release();
        }
    }

    /// <summary>Gives back the booking's seat in every week it held one.</summary>
    private async Task ReleaseSeatHoldAsync(LiveBooking booking, CancellationToken cancellationToken)
    {
        var start = await _db.LiveWeeks
            .Where(w => w.Id == booking.LiveWeekId)
            .Select(w => (DateOnly?)w.StartDate)
            .SingleOrDefaultAsync(cancellationToken);
        if (start is null)
            return;

        var first = start.Value;
        var last = first.AddDays(7 * (Math.Max(1, booking.WeeksHeld) - 1));
        var slots = await _db.LiveWeekSlots
            .Where(s => s.SlotType == booking.SlotType
                        && s.Week != null
                        && s.Week.StartDate >= first
                        && s.Week.StartDate <= last)
            .ToListAsync(cancellationToken);

        var now = DateTime.UtcNow;
        foreach (var slot in slots)
        {
            if (slot.SeatsBooked > 0)
                slot.SeatsBooked -= 1;
            slot.UpdatedAt = now;
        }
    }

    private async Task<string> GenerateOrderNumberAsync(CancellationToken cancellationToken)
    {
        var count = await _db.Orders.CountAsync(cancellationToken);
        return $"VIVI-{DateTime.UtcNow:yyyyMMdd}-{count + 1:D5}";
    }
}
