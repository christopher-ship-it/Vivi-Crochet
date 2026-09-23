using VIVI.Infrastructure.Transcoding;

namespace VIVI.Api.Jobs;

/// <summary>
/// Processes one queued video transcode at a time (protects App Service disk/CPU).
/// </summary>
public sealed class VideoTranscodeBackgroundService : BackgroundService
{
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<VideoTranscodeBackgroundService> _logger;

    public VideoTranscodeBackgroundService(
        IServiceScopeFactory scopes,
        ILogger<VideoTranscodeBackgroundService> logger)
    {
        _scopes = scopes;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(20), stoppingToken);
        }
        catch (OperationCanceledException)
        {
            return;
        }

        try
        {
            using var bootScope = _scopes.CreateScope();
            var boot = bootScope.ServiceProvider.GetRequiredService<VideoTranscodeService>();
            await boot.ReclaimInterruptedAsync(stoppingToken);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            return;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to reclaim interrupted video transcodes on startup.");
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            var didWork = false;
            try
            {
                using var scope = _scopes.CreateScope();
                var transcode = scope.ServiceProvider.GetRequiredService<VideoTranscodeService>();
                didWork = await transcode.ProcessNextAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Video transcode background tick failed.");
            }

            try
            {
                // Poll quickly when the queue is busy; idle every 15s.
                await Task.Delay(didWork ? TimeSpan.FromSeconds(2) : TimeSpan.FromSeconds(15), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }
}
