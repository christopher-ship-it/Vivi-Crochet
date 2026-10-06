using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Configuration;
using VIVI.Infrastructure.Data;
using VIVI.Infrastructure.Email;

namespace VIVI.Infrastructure.Commerce;

/// <summary>Admin cancellation of a paid order: full Razorpay refund, stock back, course access removed.</summary>
public sealed class OrderCancellationService
{
    private readonly ViviDbContext _db;
    private readonly IRazorpayPaymentGateway _razorpay;
    private readonly InventoryService _inventory;
    private readonly TransactionalEmailService _emails;
    private readonly OrderCancellationOptions _options;

    private static readonly TimeSpan IstOffset = TimeSpan.FromMinutes(330);

    public OrderCancellationService(
        ViviDbContext db,
        IRazorpayPaymentGateway razorpay,
        InventoryService inventory,
        TransactionalEmailService emails,
        IOptions<OrderCancellationOptions> options)
    {
        _db = db;
        _razorpay = razorpay;
        _inventory = inventory;
        _emails = emails;
        _options = options.Value;
    }

    /// <summary>First daily cutoff (India time) after the order was paid, as UTC. Null while unpaid.</summary>
    public DateTime? CustomerCancelDeadlineUtc(Order order)
    {
        if (order.PaidAt is not { } paidUtc)
            return null;

        var hour = Math.Clamp(_options.CutoffHourIst, 0, 23);
        var paidIst = DateTime.SpecifyKind(paidUtc, DateTimeKind.Utc) + IstOffset;
        var cutoffIst = paidIst.Date.AddHours(hour);
        if (paidIst >= cutoffIst)
            cutoffIst = cutoffIst.AddDays(1);
        return cutoffIst - IstOffset;
    }

    /// <summary>True when the customer may still cancel: paid physical-only order, not yet in production, before the cutoff.</summary>
    public bool CanCustomerCancel(Order order, DateTime? nowUtc = null)
    {
        if (order.Status is not (OrderStatus.Paid or OrderStatus.Confirmed))
            return false;
        if (order.Items.Count == 0 || order.Items.Any(i => i.ItemType != OrderItemType.Product))
            return false;
        var deadline = CustomerCancelDeadlineUtc(order);
        return deadline is not null && (nowUtc ?? DateTime.UtcNow) < deadline.Value;
    }

    /// <summary>Customer-initiated cancellation: own order, before the daily cutoff, then the full refund.</summary>
    public async Task CancelByCustomerAsync(Guid customerId, Guid orderId, CancellationToken cancellationToken)
    {
        var order = await _db.Orders
            .AsNoTracking()
            .Include(o => o.Items)
            .SingleOrDefaultAsync(o => o.Id == orderId && o.CustomerId == customerId, cancellationToken)
            ?? throw ViviException.NotFound("ORDER_NOT_FOUND", "Order was not found.");

        if (!CanCustomerCancel(order))
            throw ViviException.Conflict("CANCEL_NOT_ALLOWED", "This order can no longer be cancelled.");

        await CancelAndRefundAsync(orderId, cancellationToken);
    }

    public async Task CancelAndRefundAsync(Guid orderId, CancellationToken cancellationToken)
    {
        var order = await _db.Orders
            .Include(o => o.Items)
            .Include(o => o.Payments)
            .SingleOrDefaultAsync(o => o.Id == orderId, cancellationToken)
            ?? throw ViviException.NotFound("ORDER_NOT_FOUND", "Order was not found.");

        if (order.Status == OrderStatus.Cancelled)
            throw ViviException.Conflict("ORDER_ALREADY_CANCELLED", "This order is already cancelled.");

        if (order.Status == OrderStatus.Delivered)
            throw ViviException.Conflict("ORDER_DELIVERED", "A delivered order cannot be cancelled.");

        var payment = order.Payments.FirstOrDefault(p => p.Status == PaymentStatus.Captured && p.ProviderPaymentId != null)
            ?? throw ViviException.Conflict(
                "NO_CAPTURED_PAYMENT",
                "This order has no captured payment to refund. Use Delete for unpaid or test orders.");

        if (payment.Provider != PaymentProvider.Razorpay)
            throw ViviException.Conflict("WRONG_PROVIDER", "Only Razorpay payments can be refunded here.");

        // These draw on shared counters or fixed seats that this action does not release.
        if (order.Items.Any(i => i.ItemType == OrderItemType.LivePackage))
            throw ViviException.Conflict("LIVE_NOT_SUPPORTED", "Live class bookings must be refunded manually in Razorpay.");
        if (await _db.LaunchMemberships.AnyAsync(m => m.OrderId == order.Id, cancellationToken)
            || order.Items.Any(i => i.StudentCodeId.HasValue))
            throw ViviException.Conflict("MEMBERSHIP_NOT_SUPPORTED", "Founding-member and student-code orders must be refunded manually in Razorpay.");

        var amountPaise = (int)Math.Round(payment.Amount * 100m, MidpointRounding.AwayFromZero);
        await _razorpay.RefundPaymentAsync(payment.ProviderPaymentId!, amountPaise, order.OrderNumber, cancellationToken);

        var now = DateTime.UtcNow;
        payment.Status = PaymentStatus.Refunded;
        payment.UpdatedAt = now;

        order.Status = OrderStatus.Cancelled;
        order.UpdatedAt = now;

        await _inventory.RestoreForOrderAsync(order, cancellationToken);

        var enrollments = await _db.CourseEnrollments
            .Where(e => e.OrderId == order.Id)
            .ToListAsync(cancellationToken);
        if (enrollments.Count > 0)
        {
            var enrollmentIds = enrollments.Select(e => e.Id).ToList();
            var enrollmentEmails = await _db.EmailNotifications
                .Where(n => n.CourseEnrollmentId != null && enrollmentIds.Contains(n.CourseEnrollmentId.Value))
                .ToListAsync(cancellationToken);
            _db.EmailNotifications.RemoveRange(enrollmentEmails);
            _db.CourseEnrollments.RemoveRange(enrollments);
        }

        await _db.SaveChangesAsync(cancellationToken);

        await _emails.NotifyOrderCancelledAsync(order.Id, payment.Amount, cancellationToken);
    }
}
