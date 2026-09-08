using System.Data;
using Microsoft.EntityFrameworkCore;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Data;
using VIVI.Infrastructure.Email;

namespace VIVI.Infrastructure.Commerce;

public sealed record PaymentVerificationInput(
    Guid InternalOrderId,
    string RazorpayOrderId,
    string RazorpayPaymentId,
    string RazorpaySignature);

public sealed record PaymentFulfillmentResult(
    Order Order,
    Payment Payment,
    bool AlreadyProcessed);

public sealed class PaymentFulfillmentService
{
    private readonly ViviDbContext _db;
    private readonly IRazorpaySignatureVerifier _signatureVerifier;
    private readonly IRazorpayPaymentGateway _razorpay;
    private readonly TransactionalEmailService _emails;
    private readonly LaunchOfferService _launchOffers;
    private readonly IDeliveryEstimateService _delivery;
    private readonly InventoryService _inventory;
    private readonly LiveBookingService _liveBookings;

    public PaymentFulfillmentService(
        ViviDbContext db,
        IRazorpaySignatureVerifier signatureVerifier,
        IRazorpayPaymentGateway razorpay,
        TransactionalEmailService emails,
        LaunchOfferService launchOffers,
        IDeliveryEstimateService delivery,
        InventoryService inventory,
        LiveBookingService liveBookings)
    {
        _db = db;
        _signatureVerifier = signatureVerifier;
        _razorpay = razorpay;
        _emails = emails;
        _launchOffers = launchOffers;
        _delivery = delivery;
        _inventory = inventory;
        _liveBookings = liveBookings;
    }

    public async Task<PaymentFulfillmentResult> VerifyAndFulfillAsync(
        Guid customerId,
        PaymentVerificationInput input,
        CancellationToken cancellationToken)
    {
        await using var transaction = _db.Database.IsRelational()
            ? await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken)
            : null;

        var order = await _db.Orders
            .Include(o => o.Items)
            .Include(o => o.Payments)
            .SingleOrDefaultAsync(o => o.Id == input.InternalOrderId, cancellationToken)
            ?? throw ViviException.NotFound("ORDER_NOT_FOUND", "Order was not found.");

        if (order.CustomerId != customerId)
            throw ViviException.Forbidden("ORDER_FORBIDDEN", "You do not have access to this order.");

        if (!string.Equals(order.RazorpayOrderId, input.RazorpayOrderId, StringComparison.Ordinal))
            throw ViviException.Conflict("ORDER_MISMATCH", "Razorpay order does not match this order.");

        var payment = order.Payments.SingleOrDefault(p => p.ProviderOrderId == input.RazorpayOrderId)
            ?? throw ViviException.NotFound("PAYMENT_NOT_FOUND", "Payment record was not found.");

        if (payment.Status == PaymentStatus.Captured && payment.SignatureVerified)
        {
            if (transaction is not null)
                await transaction.CommitAsync(cancellationToken);
            return new PaymentFulfillmentResult(order, payment, AlreadyProcessed: true);
        }

        if (!_signatureVerifier.VerifyPaymentSignature(
                input.RazorpayOrderId,
                input.RazorpayPaymentId,
                input.RazorpaySignature))
            throw ViviException.Conflict("INVALID_SIGNATURE", "Payment signature verification failed.");

        var existingPayment = await _db.Payments
            .SingleOrDefaultAsync(p => p.ProviderPaymentId == input.RazorpayPaymentId, cancellationToken);
        if (existingPayment is not null && existingPayment.Id != payment.Id)
            throw ViviException.Conflict("DUPLICATE_PAYMENT", "This payment has already been processed.");

        var remote = await _razorpay.FetchPaymentAsync(input.RazorpayPaymentId, cancellationToken);
        if (remote is not null)
        {
            if (!string.Equals(remote.RazorpayOrderId, input.RazorpayOrderId, StringComparison.Ordinal))
                throw ViviException.Conflict("PAYMENT_ORDER_MISMATCH", "Payment does not belong to this order.");

            var expectedPaise = (int)Math.Round(order.TotalAmount * 100m, MidpointRounding.AwayFromZero);
            if (remote.AmountPaise != expectedPaise)
                throw ViviException.Conflict("AMOUNT_MISMATCH", "Paid amount does not match the order total.");
        }

        var now = DateTime.UtcNow;
        payment.ProviderPaymentId = input.RazorpayPaymentId;
        payment.SignatureVerified = true;
        payment.Status = PaymentStatus.Captured;
        payment.CompletedAt = now;
        payment.UpdatedAt = now;

        order.Status = HasPhysicalProducts(order) ? OrderStatus.Confirmed : OrderStatus.Confirmed;
        order.PaidAt = now;
        order.ConfirmedAt = now;
        order.UpdatedAt = now;
        _delivery.ApplyConfirmedDates(order, now);

        await _inventory.DeductForOrderAsync(order, cancellationToken);
        await CreateEnrollmentsAsync(order, now, cancellationToken);
        await _liveBookings.ConfirmBookingForOrderAsync(order, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
        if (transaction is not null)
            await transaction.CommitAsync(cancellationToken);

        await _emails.NotifyPaymentSucceededAsync(order.Id, cancellationToken);

        return new PaymentFulfillmentResult(order, payment, AlreadyProcessed: false);
    }

    public async Task<PaymentFulfillmentResult> ProcessWebhookPaymentAsync(
        string razorpayOrderId,
        string razorpayPaymentId,
        CancellationToken cancellationToken)
    {
        var order = await _db.Orders
            .Include(o => o.Items)
            .Include(o => o.Payments)
            .SingleOrDefaultAsync(o => o.RazorpayOrderId == razorpayOrderId, cancellationToken)
            ?? throw ViviException.NotFound("ORDER_NOT_FOUND", "Order was not found.");

        var payment = order.Payments.SingleOrDefault(p => p.ProviderOrderId == razorpayOrderId)
            ?? throw ViviException.NotFound("PAYMENT_NOT_FOUND", "Payment record was not found.");

        if (payment.Status == PaymentStatus.Captured && payment.SignatureVerified)
            return new PaymentFulfillmentResult(order, payment, AlreadyProcessed: true);

        await using var transaction = _db.Database.IsRelational()
            ? await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken)
            : null;

        var remote = await _razorpay.FetchPaymentAsync(razorpayPaymentId, cancellationToken)
            ?? throw ViviException.Conflict("PAYMENT_NOT_FOUND", "Unable to verify payment with Razorpay.");

        if (!string.Equals(remote.Status, "captured", StringComparison.OrdinalIgnoreCase))
            throw ViviException.Conflict("PAYMENT_NOT_CAPTURED", "Payment is not captured.");

        var existingPayment = await _db.Payments
            .SingleOrDefaultAsync(p => p.ProviderPaymentId == razorpayPaymentId, cancellationToken);
        if (existingPayment is not null && existingPayment.Id != payment.Id)
            return new PaymentFulfillmentResult(order, existingPayment, AlreadyProcessed: true);

        var now = DateTime.UtcNow;
        payment.ProviderPaymentId = razorpayPaymentId;
        payment.SignatureVerified = true;
        payment.Status = PaymentStatus.Captured;
        payment.CompletedAt = now;
        payment.UpdatedAt = now;

        order.Status = OrderStatus.Confirmed;
        order.PaidAt = now;
        order.ConfirmedAt = now;
        order.UpdatedAt = now;
        _delivery.ApplyConfirmedDates(order, now);

        await _inventory.DeductForOrderAsync(order, cancellationToken);
        await CreateEnrollmentsAsync(order, now, cancellationToken);
        await _liveBookings.ConfirmBookingForOrderAsync(order, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
        if (transaction is not null)
            await transaction.CommitAsync(cancellationToken);

        await _emails.NotifyPaymentSucceededAsync(order.Id, cancellationToken);

        return new PaymentFulfillmentResult(order, payment, AlreadyProcessed: false);
    }

    private async Task CreateEnrollmentsAsync(Order order, DateTime now, CancellationToken cancellationToken)
    {
        foreach (var item in order.Items.Where(i => i.ItemType is OrderItemType.Course or OrderItemType.CourseBundle))
        {
            if (!item.CourseId.HasValue)
                continue;

            var course = await _db.Courses
                .Include(c => c.BundleItems)
                .Include(c => c.LaunchOffer)
                .SingleAsync(c => c.Id == item.CourseId.Value, cancellationToken);

            await _launchOffers.EnsureLaunchSlotForPricedOrderOrThrowAsync(course, item.UnitPrice, cancellationToken);

            var targetCourseIds = course.Type == CourseType.Bundle
                ? course.BundleItems.OrderBy(b => b.SortOrder).Select(b => b.IncludedCourseId).ToList()
                : [course.Id];

            if (course.Type == CourseType.Bundle && targetCourseIds.Count == 0)
                throw ViviException.Conflict("BUNDLE_EMPTY", "This bundle has no included courses configured.");

            foreach (var targetCourseId in targetCourseIds)
            {
                var targetCourse = course.Type == CourseType.Bundle
                    ? await _db.Courses.AsNoTracking().SingleAsync(c => c.Id == targetCourseId, cancellationToken)
                    : course;

                var exists = await _db.CourseEnrollments.AnyAsync(
                    e => e.CustomerId == order.CustomerId
                         && e.CourseId == targetCourseId
                         && e.OrderItemId == item.Id,
                    cancellationToken);
                if (exists)
                    continue;

                var accessStart = now;
                var accessExpiry = accessStart.AddDays(course.AccessDays);

                _db.CourseEnrollments.Add(new CourseEnrollment
                {
                    Id = Guid.NewGuid(),
                    CustomerId = order.CustomerId,
                    CourseId = targetCourseId,
                    OrderId = order.Id,
                    OrderItemId = item.Id,
                    PurchaseDate = now,
                    AccessStartDate = accessStart,
                    AccessExpiryDate = accessExpiry,
                    RenewalOfferEligibleFlag = true,
                    CreatedAt = now,
                    UpdatedAt = now
                });
            }
        }
    }

    private static bool HasPhysicalProducts(Order order)
        => order.Items.Any(i => i.ItemType == OrderItemType.Product);
}
