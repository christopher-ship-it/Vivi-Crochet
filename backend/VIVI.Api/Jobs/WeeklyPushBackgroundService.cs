using VIVI.Infrastructure.Push;

namespace VIVI.Api.Jobs;

/// <summary>
/// Fallback weekly runner: every hour checks the Monday IST window and sends digests.
/// Prefer Azure calling POST /api/internal/jobs/weekly-push for reliability.
/// </summary>
public sealed class WeeklyPushBackgroundService : BackgroundService
{
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<WeeklyPushBackgroundService> _logger;

    public WeeklyPushBackgroundService(
        IServiceScopeFactory scopes,
        ILogger<WeeklyPushBackgroundService> logger)
    {
        _scopes = scopes;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await Task.Delay(TimeSpan.FromMinutes(2), stoppingToken);
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
                var push = scope.ServiceProvider.GetRequiredService<CustomerPushService>();
                await push.SendWeeklyDigestsAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Weekly push background tick failed.");
            }

            try
            {
                await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }
}
