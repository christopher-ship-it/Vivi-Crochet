using Microsoft.EntityFrameworkCore;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Data;

namespace VIVI.Infrastructure.Commerce;

/// <summary>Admin cancellation of a paid order: full Razorpay refund, stock back, course access removed.</summary>
public sealed class OrderCancellationService
{
    private readonly ViviDbContext _db;
    private readonly IRazorpayPaymentGateway _razorpay;
    private readonly InventoryService _inventory;

    public OrderCancellationService(ViviDbContext db, IRazorpayPaymentGateway razorpay, InventoryService inventory)
    {
        _db = db;
        _razorpay = razorpay;
        _inventory = inventory;
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
    }
}
