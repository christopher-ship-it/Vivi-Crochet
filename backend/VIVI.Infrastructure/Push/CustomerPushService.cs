using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Infrastructure.Data;

namespace VIVI.Infrastructure.Push;

/// <summary>Onboarding + weekly digest orchestration for customer push tokens.</summary>
public sealed class CustomerPushService
{
    public static readonly TimeSpan NewCustomerWindow = TimeSpan.FromMinutes(5);

    private readonly ViviDbContext _db;
    private readonly ExpoPushService _expo;
    private readonly ILogger<CustomerPushService> _logger;

    public CustomerPushService(
        ViviDbContext db,
        ExpoPushService expo,
        ILogger<CustomerPushService> logger)
    {
        _db = db;
        _expo = expo;
        _logger = logger;
    }

    public static bool IsNewCustomer(Customer customer, DateTime utcNow) =>
        customer.CreatedAt >= utcNow - NewCustomerWindow;

    public async Task UpsertTokenAsync(
        Guid customerId,
        string expoPushToken,
        string platform,
        CancellationToken cancellationToken)
    {
        var token = expoPushToken.Trim();
        if (string.IsNullOrWhiteSpace(token) || token.Length > 200)
            throw new ArgumentException("Invalid Expo push token.", nameof(expoPushToken));

        var normalizedPlatform = platform.Trim().ToLowerInvariant();
        if (normalizedPlatform is not ("ios" or "android"))
            normalizedPlatform = "unknown";

        var now = DateTime.UtcNow;
        var existing = await _db.DevicePushTokens
            .SingleOrDefaultAsync(t => t.ExpoPushToken == token, cancellationToken);

        if (existing is null)
        {
            _db.DevicePushTokens.Add(new DevicePushToken
            {
                Id = Guid.NewGuid(),
                CustomerId = customerId,
                ExpoPushToken = token,
                Platform = normalizedPlatform,
                IsActive = true,
                CreatedAt = now,
                UpdatedAt = now
            });
        }
        else
        {
            existing.CustomerId = customerId;
            existing.Platform = normalizedPlatform;
            existing.IsActive = true;
            existing.UpdatedAt = now;
        }

        await _db.SaveChangesAsync(cancellationToken);
        await TrySendOnboardingAsync(customerId, cancellationToken);
    }

    public async Task RemoveTokenAsync(
        Guid customerId,
        string? expoPushToken,
        CancellationToken cancellationToken)
    {
        var query = _db.DevicePushTokens.Where(t => t.CustomerId == customerId && t.IsActive);
        if (!string.IsNullOrWhiteSpace(expoPushToken))
            query = query.Where(t => t.ExpoPushToken == expoPushToken.Trim());

        var tokens = await query.ToListAsync(cancellationToken);
        if (tokens.Count == 0)
            return;

        var now = DateTime.UtcNow;
        foreach (var token in tokens)
        {
            token.IsActive = false;
            token.UpdatedAt = now;
        }

        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task TrySendOnboardingAsync(Guid customerId, CancellationToken cancellationToken)
    {
        var customer = await _db.Customers
            .SingleOrDefaultAsync(c => c.Id == customerId, cancellationToken);
        if (customer is null || customer.OnboardingPushesSentAt.HasValue)
            return;

        var tokens = await ActiveTokensAsync(customerId, cancellationToken);
        if (tokens.Count == 0)
            return;

        var messages = new List<ExpoPushMessage>();
        foreach (var to in tokens)
        {
            messages.Add(new ExpoPushMessage(
                to,
                "Welcome to VIVI",
                "Your crochet learning path is ready — explore Learn & Loop courses.",
                ScreenData("/(tabs)/learn")));
            messages.Add(new ExpoPushMessage(
                to,
                "Join a Live Crochet Circle",
                "Morning and evening seats are open. Book your first live class.",
                ScreenData("/(tabs)/live")));
        }

        await _expo.SendAsync(messages, cancellationToken);
        customer.OnboardingPushesSentAt = DateTime.UtcNow;
        customer.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        _logger.LogInformation("Sent onboarding pushes to customer {CustomerId}", customerId);
    }

    /// <summary>Sends weekly product/course/live digests for eligible customers. Returns how many customers were notified.</summary>
    public async Task<int> SendWeeklyDigestsAsync(CancellationToken cancellationToken, bool ignoreScheduleWindow = false)
    {
        if (!ignoreScheduleWindow && !IsWeeklySendWindow(DateTime.UtcNow))
        {
            _logger.LogInformation("Outside Monday 09:00–12:00 IST weekly push window; skipping.");
            return 0;
        }

        var cutoff = DateTime.UtcNow.AddDays(-7);
        var customerIds = await _db.DevicePushTokens
            .AsNoTracking()
            .Where(t => t.IsActive)
            .Select(t => t.CustomerId)
            .Distinct()
            .ToListAsync(cancellationToken);

        if (customerIds.Count == 0)
            return 0;

        var due = await _db.Customers
            .Where(c =>
                customerIds.Contains(c.Id)
                && c.IsActive
                && (c.LastWeeklyPushAt == null || c.LastWeeklyPushAt < cutoff))
            .ToListAsync(cancellationToken);

        if (due.Count == 0)
            return 0;

        var productName = await _db.Products
            .AsNoTracking()
            .Where(p => p.Status == ProductStatus.Published)
            .OrderByDescending(p => p.UpdatedAt)
            .Select(p => p.Name)
            .FirstOrDefaultAsync(cancellationToken);

        var courseName = await _db.Courses
            .AsNoTracking()
            .Where(c => c.Status == CourseStatus.Published)
            .OrderByDescending(c => c.UpdatedAt)
            .Select(c => c.Name)
            .FirstOrDefaultAsync(cancellationToken);

        var notified = 0;
        foreach (var customer in due)
        {
            var tokens = await ActiveTokensAsync(customer.Id, cancellationToken);
            if (tokens.Count == 0)
                continue;

            var productTitle = "Fresh from the VIVI studio";
            var productBody = string.IsNullOrWhiteSpace(productName)
                ? "New handmade picks just for you. Open Shop to see what’s new."
                : $"{productName} is waiting in Shop — handmade with care.";

            var courseTitle = "Keep stitching this week";
            var courseBody = string.IsNullOrWhiteSpace(courseName)
                ? "A course worth your next lesson is waiting in Learn & Loop."
                : $"Continue with {courseName} in Learn & Loop.";

            var liveTitle = "Your Live Crochet Circle";
            var liveBody = "Seats open for this week’s morning and evening classes.";

            var messages = new List<ExpoPushMessage>();
            foreach (var to in tokens)
            {
                messages.Add(new ExpoPushMessage(to, productTitle, productBody, ScreenData("/(tabs)/shop")));
                messages.Add(new ExpoPushMessage(to, courseTitle, courseBody, ScreenData("/(tabs)/learn")));
                messages.Add(new ExpoPushMessage(to, liveTitle, liveBody, ScreenData("/(tabs)/live")));
            }

            await _expo.SendAsync(messages, cancellationToken);
            customer.LastWeeklyPushAt = DateTime.UtcNow;
            customer.UpdatedAt = DateTime.UtcNow;
            notified++;
        }

        if (notified > 0)
            await _db.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Weekly digests sent to {Count} customer(s).", notified);
        return notified;
    }

    /// <summary>Best-effort push when a course access expiry email was sent (3 days out).</summary>
    public async Task TrySendCourseExpiryReminderAsync(
        Guid customerId,
        string courseName,
        Guid courseId,
        CancellationToken cancellationToken)
    {
        try
        {
            var tokens = await ActiveTokensAsync(customerId, cancellationToken);
            if (tokens.Count == 0)
                return;

            var safeName = string.IsNullOrWhiteSpace(courseName) ? "your course" : courseName.Trim();
            if (safeName.Length > 60)
                safeName = safeName[..57] + "…";

            var messages = tokens
                .Select(to => new ExpoPushMessage(
                    to,
                    "Course access ending soon",
                    $"{safeName} expires in 3 days. Renew in the app to keep learning.",
                    ScreenData($"/course/{courseId:D}")))
                .ToList();

            await _expo.SendAsync(messages, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Course expiry push failed for customer {CustomerId}", customerId);
        }
    }

    public async Task<(int DeviceCount, int CustomerCount)> GetReachAsync(CancellationToken cancellationToken)
    {
        try
        {
            // Raw SQL avoids EF GroupBy/Distinct translation issues on SQL Server.
            var devices = await _db.Database
                .SqlQueryRaw<int>(
                    "SELECT CAST(COUNT_BIG(*) AS int) AS [Value] FROM [DevicePushTokens] WHERE [IsActive] = 1")
                .SingleAsync(cancellationToken);
            var customers = await _db.Database
                .SqlQueryRaw<int>(
                    "SELECT COUNT(DISTINCT [CustomerId]) AS [Value] FROM [DevicePushTokens] WHERE [IsActive] = 1")
                .SingleAsync(cancellationToken);
            return (devices, customers);
        }
        catch (Exception ex) when (IsMissingPushSchema(ex))
        {
            _logger.LogWarning(ex, "DevicePushTokens missing; reporting zero reach.");
            return (0, 0);
        }
    }

    private static bool IsMissingPushSchema(Exception ex)
    {
        for (var current = ex; current is not null; current = current.InnerException)
        {
            var message = current.Message ?? "";
            if (message.Contains("Invalid object name", StringComparison.OrdinalIgnoreCase)
                && message.Contains("DevicePushTokens", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            if (message.Contains("DevicePushTokens", StringComparison.OrdinalIgnoreCase)
                && message.Contains("does not exist", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    /// <summary>Sends one custom notification to every active device token.</summary>
    public async Task<int> BroadcastAsync(
        string title,
        string body,
        string screen,
        CancellationToken cancellationToken)
    {
        var trimmedTitle = title.Trim();
        var trimmedBody = body.Trim();
        var trimmedScreen = string.IsNullOrWhiteSpace(screen) ? "/(tabs)/shop" : screen.Trim();

        if (trimmedTitle.Length is < 1 or > 80)
            throw new ArgumentException("Title must be 1–80 characters.", nameof(title));
        if (trimmedBody.Length is < 1 or > 240)
            throw new ArgumentException("Body must be 1–240 characters.", nameof(body));
        if (trimmedScreen.Length > 120)
            throw new ArgumentException("Screen path is too long.", nameof(screen));

        var tokens = await _db.DevicePushTokens
            .AsNoTracking()
            .Where(t => t.IsActive)
            .Select(t => t.ExpoPushToken)
            .Distinct()
            .ToListAsync(cancellationToken);

        if (tokens.Count == 0)
            return 0;

        var data = ScreenData(trimmedScreen);
        var messages = tokens
            .Select(to => new ExpoPushMessage(to, trimmedTitle, trimmedBody, data))
            .ToList();

        await _expo.SendAsync(messages, cancellationToken);
        _logger.LogInformation(
            "Broadcast push sent to {Count} device(s): {Title}",
            tokens.Count,
            trimmedTitle);
        return tokens.Count;
    }

    public static bool IsWeeklySendWindow(DateTime utcNow)
    {
        var ist = ResolveIst();
        var local = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utcNow, DateTimeKind.Utc), ist);
        return local.DayOfWeek == DayOfWeek.Monday
            && local.Hour is >= 9 and < 12;
    }

    private static TimeZoneInfo ResolveIst()
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(
                OperatingSystem.IsWindows() ? "India Standard Time" : "Asia/Kolkata");
        }
        catch (TimeZoneNotFoundException)
        {
            return TimeZoneInfo.CreateCustomTimeZone(
                "IST",
                TimeSpan.FromHours(5.5),
                "IST",
                "IST");
        }
    }

    private async Task<List<string>> ActiveTokensAsync(Guid customerId, CancellationToken cancellationToken) =>
        await _db.DevicePushTokens
            .AsNoTracking()
            .Where(t => t.CustomerId == customerId && t.IsActive)
            .Select(t => t.ExpoPushToken)
            .ToListAsync(cancellationToken);

    private static Dictionary<string, string> ScreenData(string screen) =>
        new() { ["screen"] = screen };
}
