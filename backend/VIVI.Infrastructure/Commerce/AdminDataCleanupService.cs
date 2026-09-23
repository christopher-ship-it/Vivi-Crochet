using Microsoft.EntityFrameworkCore;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Infrastructure.Auth;
using VIVI.Infrastructure.Data;

namespace VIVI.Infrastructure.Commerce;

/// <summary>
/// Hard-delete helpers for admin console cleanup (test data / GDPR-style customer wipe).
/// </summary>
public sealed class AdminDataCleanupService
{
    private readonly ViviDbContext _db;
    private readonly InventoryService _inventory;

    public AdminDataCleanupService(ViviDbContext db, InventoryService inventory)
    {
        _db = db;
        _inventory = inventory;
    }

    public async Task DeleteOrderAsync(Guid orderId, CancellationToken cancellationToken)
    {
        var order = await _db.Orders
            .Include(o => o.Items)
            .SingleOrDefaultAsync(o => o.Id == orderId, cancellationToken)
            ?? throw ViviException.NotFound("ORDER_NOT_FOUND", "Order was not found.");

        await DeleteOrderGraphAsync(order, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task DeleteCustomerAsync(Guid customerId, CancellationToken cancellationToken)
    {
        var customer = await _db.Customers
            .SingleOrDefaultAsync(c => c.Id == customerId, cancellationToken)
            ?? throw ViviException.NotFound("CUSTOMER_NOT_FOUND", "Customer was not found.");

        var userId = customer.UserId;
        var emailsToFree = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (!string.IsNullOrWhiteSpace(customer.Email))
            emailsToFree.Add(CustomerAccountService.NormalizeEmail(customer.Email));

        var orderIds = await _db.Orders
            .Where(o => o.CustomerId == customerId)
            .Select(o => o.Id)
            .ToListAsync(cancellationToken);

        foreach (var orderId in orderIds)
        {
            var order = await _db.Orders
                .Include(o => o.Items)
                .SingleAsync(o => o.Id == orderId, cancellationToken);
            await DeleteOrderGraphAsync(order, cancellationToken);
        }

        // Orphan enrollments/bookings without order (should be rare).
        var leftoverEnrollments = await _db.CourseEnrollments
            .Where(e => e.CustomerId == customerId)
            .ToListAsync(cancellationToken);
        if (leftoverEnrollments.Count > 0)
        {
            var enrollmentIds = leftoverEnrollments.Select(e => e.Id).ToList();
            var enrollmentEmails = await _db.EmailNotifications
                .Where(n => n.CourseEnrollmentId != null && enrollmentIds.Contains(n.CourseEnrollmentId.Value))
                .ToListAsync(cancellationToken);
            _db.EmailNotifications.RemoveRange(enrollmentEmails);
            _db.CourseEnrollments.RemoveRange(leftoverEnrollments);
        }

        var leftoverBookings = await _db.LiveBookings
            .Where(b => b.CustomerId == customerId)
            .ToListAsync(cancellationToken);
        _db.LiveBookings.RemoveRange(leftoverBookings);

        // Support inquiries cascade from customer, but remove explicitly for clarity.
        var inquiries = await _db.SupportInquiries
            .Where(i => i.CustomerId == customerId)
            .ToListAsync(cancellationToken);
        _db.SupportInquiries.RemoveRange(inquiries);

        var verifyChallenges = await _db.EmailVerificationChallenges
            .Where(c => c.CustomerId == customerId)
            .ToListAsync(cancellationToken);
        _db.EmailVerificationChallenges.RemoveRange(verifyChallenges);

        var pushTokens = await _db.DevicePushTokens
            .Where(t => t.CustomerId == customerId)
            .ToListAsync(cancellationToken);
        _db.DevicePushTokens.RemoveRange(pushTokens);

        _db.Customers.Remove(customer);

        var user = await _db.AdminUsers.SingleOrDefaultAsync(u => u.Id == userId, cancellationToken);
        if (user is not null)
        {
            if (!string.IsNullOrWhiteSpace(user.Email))
                emailsToFree.Add(CustomerAccountService.NormalizeEmail(user.Email));

            // Always remove the linked login for a deleted customer account.
            if (user.Role == UserRole.Customer)
                _db.AdminUsers.Remove(user);
        }

        await FreeEmailsAsync(emailsToFree, keepUserId: null, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>
    /// Removes orphan customer logins and reset challenges for an email so it can be reused
    /// after dashboard deletes (Customers gone but AdminUsers row left behind).
    /// </summary>
    public async Task FreeEmailForReuseAsync(string email, CancellationToken cancellationToken, Guid? keepUserId = null)
    {
        var normalized = CustomerAccountService.NormalizeEmail(email);
        if (string.IsNullOrWhiteSpace(normalized) || normalized.EndsWith("@vivicrochet.dev", StringComparison.OrdinalIgnoreCase))
            return;

        await FreeEmailsAsync([normalized], keepUserId, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
    }

    private async Task FreeEmailsAsync(
        IEnumerable<string> emails,
        Guid? keepUserId,
        CancellationToken cancellationToken)
    {
        var list = emails
            .Select(CustomerAccountService.NormalizeEmail)
            .Where(e => !string.IsNullOrWhiteSpace(e))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (list.Count == 0)
            return;

        var resets = await _db.PasswordResetChallenges
            .Where(c => list.Contains(c.Email))
            .ToListAsync(cancellationToken);
        _db.PasswordResetChallenges.RemoveRange(resets);

        // Orphan customer logins: AdminUsers with Role=Customer and no Customers row.
        var orphanLogins = await _db.AdminUsers
            .Where(u => u.Role == UserRole.Customer && list.Contains(u.Email))
            .Where(u => keepUserId == null || u.Id != keepUserId)
            .Where(u => !_db.Customers.Any(c => c.UserId == u.Id))
            .ToListAsync(cancellationToken);
        _db.AdminUsers.RemoveRange(orphanLogins);
    }

    private async Task DeleteOrderGraphAsync(Order order, CancellationToken cancellationToken)
    {
        if (order.InventoryDeducted)
            await _inventory.RestoreForOrderAsync(order, cancellationToken);

        var orderEmails = await _db.EmailNotifications
            .Where(n => n.OrderId == order.Id)
            .ToListAsync(cancellationToken);
        _db.EmailNotifications.RemoveRange(orderEmails);

        var bookings = await _db.LiveBookings
            .Where(b => b.OrderId == order.Id)
            .ToListAsync(cancellationToken);
        _db.LiveBookings.RemoveRange(bookings);

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

        // Payments, items, delivery updates cascade with the order.
        _db.Orders.Remove(order);
    }
}
