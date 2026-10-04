using System.Data;
using Microsoft.EntityFrameworkCore;
using VIVI.Core;
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
    private readonly PricingService _pricing;
    private readonly IDeliveryEstimateService _delivery;
    private readonly InventoryService _inventory;
    private readonly LiveBookingService _liveBookings;
    private readonly DeliverySequenceService _sequence;

    public PaymentFulfillmentService(
        ViviDbContext db,
        IRazorpaySignatureVerifier signatureVerifier,
        IRazorpayPaymentGateway razorpay,
        TransactionalEmailService emails,
        LaunchOfferService launchOffers,
        PricingService pricing,
        IDeliveryEstimateService delivery,
        InventoryService inventory,
        LiveBookingService liveBookings,
        DeliverySequenceService sequence)
    {
        _db = db;
        _signatureVerifier = signatureVerifier;
        _razorpay = razorpay;
        _emails = emails;
        _launchOffers = launchOffers;
        _pricing = pricing;
        _delivery = delivery;
        _inventory = inventory;
        _liveBookings = liveBookings;
        _sequence = sequence;
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

        if (payment.Provider != PaymentProvider.Razorpay)
            throw ViviException.Conflict("WRONG_PROVIDER", "This order must be paid with Razorpay.");

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
            if (!string.IsNullOrWhiteSpace(remote.Currency)
                && !string.Equals(remote.Currency, order.Currency, StringComparison.OrdinalIgnoreCase))
                throw ViviException.Conflict("CURRENCY_MISMATCH", "Paid currency does not match the order currency.");
        }

        payment.ProviderPaymentId = input.RazorpayPaymentId;
        payment.SignatureVerified = true;

        return await CompleteFulfillmentAsync(order, payment, transaction, cancellationToken);
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

        payment.ProviderPaymentId = razorpayPaymentId;
        payment.SignatureVerified = true;

        return await CompleteFulfillmentAsync(order, payment, transaction, cancellationToken);
    }

    private async Task<PaymentFulfillmentResult> CompleteFulfillmentAsync(
        Order order,
        Payment payment,
        Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction? transaction,
        CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        payment.Status = PaymentStatus.Captured;
        payment.CompletedAt = now;
        payment.UpdatedAt = now;

        order.Status = OrderStatus.Confirmed;
        order.PaidAt = now;
        order.ConfirmedAt = now;
        order.UpdatedAt = now;

        // Held until this order (and its delivery date) is saved, so the next Handmade payment
        // for the same customer sees it.
        IAsyncDisposable? deliveryLock = null;
        try
        {
            deliveryLock = await ApplyDeliveryDatesAsync(order, now, cancellationToken);

            await _inventory.DeductForOrderAsync(order, cancellationToken);
            await CreateEnrollmentsAsync(order, now, cancellationToken);
            await _liveBookings.ConfirmBookingForOrderAsync(order, cancellationToken);
            await _db.SaveChangesAsync(cancellationToken);
            if (transaction is not null)
                await transaction.CommitAsync(cancellationToken);
        }
        finally
        {
            if (deliveryLock is not null)
                await deliveryLock.DisposeAsync();
        }

        await _emails.NotifyPaymentSucceededAsync(order.Id, cancellationToken);

        return new PaymentFulfillmentResult(order, payment, AlreadyProcessed: false);
    }

    /// <summary>
    /// Fixes the delivery dates of a newly paid physical order. Runs inside the payment transaction
    /// under a per-customer lock, so simultaneous payments get consecutive (never identical) dates.
    /// </summary>
    private async Task<IAsyncDisposable?> ApplyDeliveryDatesAsync(Order order, DateTime paidAtUtc, CancellationToken cancellationToken)
    {
        var productIds = order.Items
            .Where(i => i.ItemType == OrderItemType.Product && i.ProductId.HasValue)
            .Select(i => i.ProductId!.Value)
            .Distinct()
            .ToList();

        // Not a physical order (courses, memberships…) or no estimate was ever made: leave as is.
        if (productIds.Count == 0 || order.DeliveryEstimateMinDays is null)
            return null;

        var types = await _db.Products
            .AsNoTracking()
            .Where(p => productIds.Contains(p.Id))
            .Select(p => p.ProductType)
            .ToListAsync(cancellationToken);
        if (types.Count == 0)
        {
            _delivery.ApplyConfirmedDates(order, paidAtUtc);
            return null;
        }

        var isCoimbatore = order.IsCoimbatoreDelivery == true;
        var standard = _delivery.Combine(types.Select(t => _delivery.WindowFor(t, isCoimbatore)));

        // Only Handmade orders are sequenced; Essentials keep their standard window and need no lock.
        var isHandmade = types.Contains(ProductType.Handmade);
        var deliveryLock = isHandmade
            ? await _sequence.LockCustomerAsync(order.CustomerId, cancellationToken)
            : null;

        var anchor = paidAtUtc;
        if (deliveryLock is not null)
        {
            // "Most recently paid" is how the next Handmade order finds its predecessor, so the
            // payment time must follow the order in which the lock lets orders through. It was
            // stamped before waiting for the lock, which could put overlapping payments out of order.
            anchor = DateTime.UtcNow;
            order.PaidAt = anchor;
            order.ConfirmedAt = anchor;
            order.UpdatedAt = anchor;
        }

        var plan = await _sequence.PlanAsync(order.CustomerId, standard, anchor, order.Id, isHandmade, cancellationToken);
        _delivery.ApplyEstimate(order, plan.Dates, plan.Window, isCoimbatore);
        return deliveryLock;
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

            var market = Markets.ForCurrency(order.Currency);
            var renewal = await _pricing.TryResolveRenewalAsync(
                course,
                order.CustomerId,
                now,
                cancellationToken,
                market);
            var isRenewalPurchase = renewal is not null
                && decimal.Round(item.UnitPrice, market.UsesBasePrices ? 0 : 2, MidpointRounding.AwayFromZero)
                    == renewal.RenewalPrice;

            // A student-code purchase has its own member numbering and never uses a launch slot.
            var isStudentPurchase = !isRenewalPurchase
                && item.StudentCodeId.HasValue
                && course.Type == CourseType.Bundle
                && course.LaunchOffer is not null;

            int? memberNumber = null;
            if (isStudentPurchase)
                memberNumber = await _launchOffers.ConsumeStudentPurchaseAsync(item.StudentCodeId!.Value, course.Id, cancellationToken);
            else if (!isRenewalPurchase)
                memberNumber = await _launchOffers.EnsureLaunchSlotForPricedOrderOrThrowAsync(course, item.UnitPrice, cancellationToken, market);

            var isFoundingMembership = memberNumber.HasValue && course.LaunchOffer is not null;

            var targetCourseIds = course.Type == CourseType.Bundle
                ? course.BundleItems.OrderBy(b => b.SortOrder).Select(b => b.IncludedCourseId).ToList()
                : new List<Guid> { course.Id };

            if (course.Type == CourseType.Bundle && targetCourseIds.Count == 0)
                throw ViviException.Conflict("BUNDLE_EMPTY", "This bundle has no included courses configured.");

            if (isFoundingMembership && course.LaunchOffer!.ViralProjectCourseId is Guid viralProjectCourseId
                && !targetCourseIds.Contains(viralProjectCourseId))
            {
                targetCourseIds.Add(viralProjectCourseId);
            }

            if (isRenewalPurchase)
                await _pricing.MarkRenewalOffersUsedAsync(order.CustomerId, course, now, cancellationToken);

            var accessStart = now;
            var membershipAccessExpiry = isFoundingMembership
                ? accessStart.AddDays(course.LaunchOffer!.AccessDurationDays)
                : (DateTime?)null;

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

                var accessExpiry = isFoundingMembership
                    ? membershipAccessExpiry!.Value
                    : isRenewalPurchase
                        ? await _pricing.ResolveRenewalAccessExpiryAsync(
                            order.CustomerId,
                            [targetCourseId],
                            course.AccessDays,
                            now,
                            cancellationToken)
                        : accessStart.AddDays(course.AccessDays);

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

            if (isFoundingMembership)
            {
                var membershipExists = await _db.LaunchMemberships.AnyAsync(
                    m => m.OrderItemId == item.Id, cancellationToken);
                if (!membershipExists)
                {
                    _db.LaunchMemberships.Add(new LaunchMembership
                    {
                        Id = Guid.NewGuid(),
                        CustomerId = order.CustomerId,
                        CourseId = course.Id,
                        OrderId = order.Id,
                        OrderItemId = item.Id,
                        MemberNumber = memberNumber!.Value,
                        IsStudent = isStudentPurchase,
                        StudentCodeId = isStudentPurchase ? item.StudentCodeId : null,
                        MemberCode = isStudentPurchase
                            ? PublicIds.NewStudentMemberCode(memberNumber.Value)
                            : PublicIds.NewMemberCode(memberNumber.Value),
                        ViralProjectCourseId = course.LaunchOffer!.ViralProjectCourseId,
                        AccessStartDate = accessStart,
                        AccessExpiryDate = membershipAccessExpiry!.Value,
                        BadgeGrantedAt = now,
                        CreatedAt = now,
                        UpdatedAt = now
                    });
                }
            }
        }
    }
}
