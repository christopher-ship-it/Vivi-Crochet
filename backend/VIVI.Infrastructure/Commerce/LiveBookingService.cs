using System.Collections.Concurrent;
using System.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Configuration;
using VIVI.Infrastructure.Data;

namespace VIVI.Infrastructure.Commerce;

public sealed record LiveCheckoutResult(
    LiveBooking Booking,
    Order Order,
    string RazorpayOrderId,
    string RazorpayKeyId,
    int AmountPaise,
    string Currency);

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

    public async Task<LiveCheckoutResult> CreateBookingCheckoutAsync(
        Guid customerId,
        Guid weekId,
        LiveSlotType slotType,
        CancellationToken cancellationToken)
    {
        await _calendar.EnsureSeasonAsync(cancellationToken);
        await ReleaseExpiredReservationsAsync(cancellationToken);

        var gate = SeatGates.GetOrAdd($"{weekId:N}:{slotType}", _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(cancellationToken);
        try
        {
            await using var transaction = _db.Database.IsRelational()
                ? await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken)
                : null;

            var week = await _db.LiveWeeks
                .Include(w => w.Slots)
                .SingleOrDefaultAsync(w => w.Id == weekId, cancellationToken)
                ?? throw ViviException.NotFound("LIVE_WEEK_NOT_FOUND", "Live week was not found.");

            if (!week.IsBookable)
                throw ViviException.Conflict("WEEK_NOT_BOOKABLE", "This week is not open for booking.");

            if (!_calendar.IsCustomerSelectableWeek(week))
                throw ViviException.Conflict(
                    "WEEK_OUTSIDE_WINDOW",
                    "You can only book the current week or next week.");

            // Validate schedule (Sunday never bookable; replacement rules).
            _ = _calendar.BuildDayPlan(week);

            var duplicate = await _db.LiveBookings.AnyAsync(
                b =>
                    b.CustomerId == customerId
                    && b.LiveWeekId == weekId
                    && b.SlotType == slotType
                    && (b.Status == LiveBookingStatus.Confirmed || b.Status == LiveBookingStatus.PendingPayment),
                cancellationToken);
            if (duplicate)
                throw ViviException.Conflict("ALREADY_BOOKED", "You already booked this week and slot.");

            var slot = week.Slots.SingleOrDefault(s => s.SlotType == slotType)
                ?? throw ViviException.NotFound("LIVE_SLOT_NOT_FOUND", "Live slot was not found.");

            if (slot.SeatsBooked >= slot.SeatCapacity)
                throw ViviException.Conflict("FULLY_BOOKED", "This slot is fully booked.");

            var now = DateTime.UtcNow;
            slot.SeatsBooked += 1;
            slot.UpdatedAt = now;

            var price = _options.PackagePrice;
            var slotName = _calendar.SlotName(slotType);
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
                ItemNameSnapshot = $"{slotName} · Week {week.WeekNumber}"
            };
            order.Items.Add(orderItem);

            var amountPaise = (int)Math.Round(price * 100m, MidpointRounding.AwayFromZero);
            var razorpayOrder = await _razorpay.CreateOrderAsync(order.OrderNumber, amountPaise, order.Currency, cancellationToken);
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
                razorpayOrder.RazorpayOrderId,
                _razorpayOptions.KeyId,
                razorpayOrder.AmountPaise,
                razorpayOrder.Currency);
        }
        finally
        {
            gate.Release();
        }
    }

    private async Task ReleaseSeatHoldAsync(LiveBooking booking, CancellationToken cancellationToken)
    {
        var slot = await _db.LiveWeekSlots.SingleOrDefaultAsync(
            s => s.LiveWeekId == booking.LiveWeekId && s.SlotType == booking.SlotType,
            cancellationToken);
        if (slot is null)
            return;
        if (slot.SeatsBooked > 0)
            slot.SeatsBooked -= 1;
        slot.UpdatedAt = DateTime.UtcNow;
    }

    private async Task<string> GenerateOrderNumberAsync(CancellationToken cancellationToken)
    {
        var count = await _db.Orders.CountAsync(cancellationToken);
        return $"VIVI-{DateTime.UtcNow:yyyyMMdd}-{count + 1:D5}";
    }
}
