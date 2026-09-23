using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Data;
using VIVI.Infrastructure.Email.Templates;

namespace VIVI.Infrastructure.Email;

public sealed class TransactionalEmailService
{
    public const string OrderConfirmationKeyPrefix = "order-confirmation:";
    public const string CourseActivationKeyPrefix = "course-activation:";
    public const string CourseExpiryReminderKeyPrefix = "course-expiry-reminder:";
    public const string DeliveryDateUpdatedKeyPrefix = "delivery-date-updated:";
    public const string LiveBookingConfirmationKeyPrefix = "live-booking-confirmation:";

    private readonly ViviDbContext _db;
    private readonly IEmailService _email;
    private readonly ILogger<TransactionalEmailService> _logger;

    public TransactionalEmailService(
        ViviDbContext db,
        IEmailService email,
        ILogger<TransactionalEmailService> logger)
    {
        _db = db;
        _email = email;
        _logger = logger;
    }

    public async Task NotifyPaymentSucceededAsync(Guid orderId, CancellationToken cancellationToken)
    {
        try
        {
            var order = await _db.Orders
                .AsNoTracking()
                .Include(o => o.Items)
                .SingleOrDefaultAsync(o => o.Id == orderId, cancellationToken);

            if (order is null || order.Status is not (OrderStatus.Paid or OrderStatus.Confirmed))
                return;

            var customer = await _db.Customers
                .AsNoTracking()
                .SingleAsync(c => c.Id == order.CustomerId, cancellationToken);

            await SendOrderConfirmationAsync(order, customer, cancellationToken);

            if (order.Items.Any(i => i.ItemType == OrderItemType.LivePackage))
            {
                await SendLiveBookingConfirmationAsync(order, customer, cancellationToken);
            }

            // Bundle / All-Access Pass: one order confirmation covers the purchase.
            // Do not send a separate "course is ready" email per included course.
            if (order.Items.Any(i => i.ItemType == OrderItemType.CourseBundle))
                return;

            var enrollments = await _db.CourseEnrollments
                .AsNoTracking()
                .Include(e => e.Course)
                .Where(e => e.OrderId == orderId)
                .ToListAsync(cancellationToken);

            foreach (var enrollment in enrollments)
            {
                if (enrollment.Course is null)
                    continue;

                await SendCourseAccessAsync(customer, enrollment.Course, enrollment, cancellationToken);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Post-payment email notification failed for order {OrderId}", orderId);
        }
    }

    public async Task NotifyDeliveryDateUpdatedAsync(Guid orderId, CancellationToken cancellationToken)
    {
        try
        {
            var order = await _db.Orders
                .AsNoTracking()
                .Include(o => o.Items)
                .SingleOrDefaultAsync(o => o.Id == orderId, cancellationToken);
            if (order is null)
                return;

            var customer = await _db.Customers
                .AsNoTracking()
                .SingleAsync(c => c.Id == order.CustomerId, cancellationToken);

            var stamp = (order.ManualDeliveryDateFrom ?? order.EstimatedDeliveryDateFrom)?.ToString("yyyyMMdd")
                        + "-"
                        + (order.ManualDeliveryDateTo ?? order.EstimatedDeliveryDateTo)?.ToString("yyyyMMdd");
            var (subject, html, text) = DeliveryDateUpdatedEmail.Render(customer, order);
            await SendIdempotentAsync(
                $"{DeliveryDateUpdatedKeyPrefix}{order.Id}:{stamp}",
                EmailNotificationType.DeliveryDateUpdated,
                customer.Email,
                subject,
                html,
                text,
                orderId: order.Id,
                enrollmentId: null,
                cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Delivery-date update email failed for order {OrderId}", orderId);
        }
    }

    public async Task RetryPendingAsync(CancellationToken cancellationToken, int maxBatch = 25)
    {
        var pending = await _db.EmailNotifications
            .Where(n => n.Status != EmailNotificationStatus.Sent && n.AttemptCount < 5)
            .OrderBy(n => n.CreatedAt)
            .Take(maxBatch)
            .ToListAsync(cancellationToken);

        foreach (var notification in pending)
            await DispatchAsync(notification, cancellationToken);
    }

    private async Task SendOrderConfirmationAsync(
        Order order,
        Customer customer,
        CancellationToken cancellationToken)
    {
        var (subject, html, text) = OrderConfirmationEmail.Render(customer, order, order.Items.ToList());
        await SendIdempotentAsync(
            $"{OrderConfirmationKeyPrefix}{order.Id}",
            EmailNotificationType.OrderConfirmation,
            customer.Email,
            subject,
            html,
            text,
            orderId: order.Id,
            enrollmentId: null,
            cancellationToken);
    }

    private async Task SendLiveBookingConfirmationAsync(
        Order order,
        Customer customer,
        CancellationToken cancellationToken)
    {
        var booking = await _db.LiveBookings
            .AsNoTracking()
            .Include(b => b.Week)
            .SingleOrDefaultAsync(b => b.OrderId == order.Id && b.Status == LiveBookingStatus.Confirmed, cancellationToken);
        if (booking?.Week is null)
            return;

        var slotName = booking.SlotType == LiveSlotType.Morning
            ? "Morning Crochet Circle"
            : "Evening Crochet Circle";
        var (subject, html, text) = LiveBookingConfirmationEmail.Render(customer, order, booking, booking.Week, slotName);
        await SendIdempotentAsync(
            $"{LiveBookingConfirmationKeyPrefix}{booking.Id}",
            EmailNotificationType.LiveBookingConfirmation,
            customer.Email,
            subject,
            html,
            text,
            orderId: order.Id,
            enrollmentId: null,
            cancellationToken);
    }

    private async Task SendCourseAccessAsync(
        Customer customer,
        Course course,
        CourseEnrollment enrollment,
        CancellationToken cancellationToken)
    {
        var (subject, html, text) = CourseAccessEmail.Render(customer, course, enrollment);
        await SendIdempotentAsync(
            $"{CourseActivationKeyPrefix}{enrollment.Id}",
            EmailNotificationType.CourseAccess,
            customer.Email,
            subject,
            html,
            text,
            orderId: enrollment.OrderId,
            enrollmentId: enrollment.Id,
            cancellationToken);
    }

    internal async Task SendExpiryReminderAsync(
        Customer customer,
        Course course,
        CourseEnrollment enrollment,
        CancellationToken cancellationToken)
    {
        var showRenewal = enrollment.RenewalOfferEligibleFlag && !enrollment.RenewalOfferUsedFlag;
        var (subject, html, text) = CourseExpiryReminderEmail.Render(
            customer,
            course,
            enrollment,
            showRenewal,
            course.RenewalPercentage);

        await SendIdempotentAsync(
            $"{CourseExpiryReminderKeyPrefix}{enrollment.Id}",
            EmailNotificationType.CourseExpiryReminder,
            customer.Email,
            subject,
            html,
            text,
            orderId: enrollment.OrderId,
            enrollmentId: enrollment.Id,
            cancellationToken);
    }

    private async Task SendIdempotentAsync(
        string idempotencyKey,
        EmailNotificationType type,
        string recipient,
        string subject,
        string html,
        string? text,
        Guid? orderId,
        Guid? enrollmentId,
        CancellationToken cancellationToken)
    {
        var existing = await _db.EmailNotifications
            .SingleOrDefaultAsync(n => n.IdempotencyKey == idempotencyKey, cancellationToken);

        if (existing?.Status == EmailNotificationStatus.Sent)
            return;

        EmailNotification notification;
        if (existing is null)
        {
            var now = DateTime.UtcNow;
            notification = new EmailNotification
            {
                Id = Guid.NewGuid(),
                IdempotencyKey = idempotencyKey,
                Type = type,
                RecipientEmail = recipient,
                Subject = subject,
                HtmlBody = html,
                TextBody = text,
                Status = EmailNotificationStatus.Pending,
                OrderId = orderId,
                CourseEnrollmentId = enrollmentId,
                CreatedAt = now,
                UpdatedAt = now
            };
            _db.EmailNotifications.Add(notification);
            try
            {
                await _db.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException)
            {
                existing = await _db.EmailNotifications
                    .SingleOrDefaultAsync(n => n.IdempotencyKey == idempotencyKey, cancellationToken);
                if (existing?.Status == EmailNotificationStatus.Sent)
                    return;
                if (existing is null)
                    throw;
                notification = existing;
            }
        }
        else
        {
            notification = existing;
        }

        await DispatchAsync(notification, cancellationToken);
    }

    private async Task DispatchAsync(EmailNotification notification, CancellationToken cancellationToken)
    {
        if (notification.Status == EmailNotificationStatus.Sent)
            return;

        notification.AttemptCount += 1;
        notification.UpdatedAt = DateTime.UtcNow;

        var result = await _email.SendAsync(
            new EmailSendRequest(
                notification.RecipientEmail,
                notification.Subject,
                notification.HtmlBody,
                notification.TextBody),
            cancellationToken);

        if (result.Success)
        {
            notification.Status = EmailNotificationStatus.Sent;
            notification.ProviderMessageId = result.MessageId;
            notification.SentAt = DateTime.UtcNow;
            notification.LastError = null;
        }
        else
        {
            notification.Status = EmailNotificationStatus.Failed;
            notification.LastError = result.Error;
            _logger.LogWarning(
                "Email notification {Key} failed attempt {Attempt}: {Error}",
                notification.IdempotencyKey,
                notification.AttemptCount,
                result.Error);
        }

        await _db.SaveChangesAsync(cancellationToken);
    }
}
