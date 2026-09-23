using VIVI.Infrastructure.Email;

namespace VIVI.Api.Jobs;

/// <summary>
/// Daily runner for course access expiry reminders (3 days before AccessExpiryDate).
/// Prefer Azure calling POST /api/internal/jobs/expiry-reminders for reliability.
/// </summary>
public sealed class ExpiryReminderBackgroundService : BackgroundService
{
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<ExpiryReminderBackgroundService> _logger;

    public ExpiryReminderBackgroundService(
        IServiceScopeFactory scopes,
        ILogger<ExpiryReminderBackgroundService> logger)
    {
        _scopes = scopes;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await Task.Delay(TimeSpan.FromMinutes(3), stoppingToken);
        }
        catch (OperationCanceledException)
        {
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopes.CreateScope();
                var reminders = scope.ServiceProvider.GetRequiredService<ExpiryReminderService>();
                var sent = await reminders.ProcessDueRemindersAsync(DateTime.UtcNow, stoppingToken);
                if (sent > 0)
                    _logger.LogInformation("Sent {Count} course expiry reminder(s).", sent);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Expiry reminder background tick failed.");
            }

            try
            {
                await Task.Delay(TimeSpan.FromHours(6), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }
}
