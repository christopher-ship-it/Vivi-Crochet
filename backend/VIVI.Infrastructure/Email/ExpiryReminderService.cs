using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using VIVI.Infrastructure.Data;
using VIVI.Infrastructure.Push;

namespace VIVI.Infrastructure.Email;

/// <summary>
/// Sends course expiry reminders exactly once per access cycle, 3 days before expiry.
/// Runs via ExpiryReminderBackgroundService and POST /api/internal/jobs/expiry-reminders.
/// </summary>
public sealed class ExpiryReminderService
{
    private readonly ViviDbContext _db;
    private readonly TransactionalEmailService _emails;
    private readonly CustomerPushService _push;
    private readonly ILogger<ExpiryReminderService> _logger;

    public ExpiryReminderService(
        ViviDbContext db,
        TransactionalEmailService emails,
        CustomerPushService push,
        ILogger<ExpiryReminderService> logger)
    {
        _db = db;
        _emails = emails;
        _push = push;
        _logger = logger;
    }

    public async Task<int> ProcessDueRemindersAsync(DateTime utcNow, CancellationToken cancellationToken)
    {
        var targetDate = utcNow.Date.AddDays(3);
        var enrollments = await _db.CourseEnrollments
            .Include(e => e.Course)
            .Include(e => e.Customer)
            .Where(e =>
                !e.ExpiryReminderSentFlag
                && e.AccessExpiryDate > utcNow
                && e.AccessExpiryDate.Date == targetDate)
            .ToListAsync(cancellationToken);

        var sent = 0;
        foreach (var enrollment in enrollments)
        {
            if (enrollment.Customer is null || enrollment.Course is null)
                continue;

            try
            {
                await _emails.SendExpiryReminderAsync(
                    enrollment.Customer,
                    enrollment.Course,
                    enrollment,
                    cancellationToken);

                var tracked = await _db.CourseEnrollments
                    .SingleAsync(e => e.Id == enrollment.Id, cancellationToken);

                var key = $"{TransactionalEmailService.CourseExpiryReminderKeyPrefix}{enrollment.Id}";
                var notification = await _db.EmailNotifications
                    .AsNoTracking()
                    .SingleOrDefaultAsync(n => n.IdempotencyKey == key, cancellationToken);

                if (notification?.Status == Core.Enums.EmailNotificationStatus.Sent)
                {
                    tracked.ExpiryReminderSentFlag = true;
                    tracked.UpdatedAt = DateTime.UtcNow;
                    await _db.SaveChangesAsync(cancellationToken);
                    sent++;

                    await _push.TrySendCourseExpiryReminderAsync(
                        enrollment.Customer.Id,
                        enrollment.Course.Name,
                        enrollment.Course.Id,
                        cancellationToken);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(
                    ex,
                    "Expiry reminder failed for enrollment {EnrollmentId}",
                    enrollment.Id);
            }
        }

        return sent;
    }
}
