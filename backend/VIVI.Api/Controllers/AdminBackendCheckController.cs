using System.Diagnostics;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using VIVI.Api.Auth;
using VIVI.Api.Services;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Data;

namespace VIVI.Api.Controllers;

/// <summary>Live health checks and this instance's request statistics, for the admin "Backend check" page.</summary>
[ApiController]
[Route("api/admin/backend-check")]
[Authorize(Roles = AuthRoles.Console)]
public sealed class AdminBackendCheckController : ControllerBase
{
    private readonly ViviDbContext _db;
    private readonly IBlobStorageService _blob;
    private readonly RequestMetrics _metrics;

    public AdminBackendCheckController(ViviDbContext db, IBlobStorageService blob, RequestMetrics metrics)
    {
        _db = db;
        _blob = blob;
        _metrics = metrics;
    }

    [HttpGet]
    public async Task<ActionResult<BackendCheckResponse>> Get(CancellationToken cancellationToken)
    {
        var routes = _metrics.Routes();
        var process = Process.GetCurrentProcess();

        return Ok(new BackendCheckResponse
        {
            StartedAt = _metrics.StartedAt,
            UptimeSeconds = (long)(DateTime.UtcNow - _metrics.StartedAt).TotalSeconds,
            TotalRequests = routes.Sum(r => r.Count),
            ClientErrors = routes.Sum(r => r.ClientErrors),
            ServerErrors = routes.Sum(r => r.ServerErrors),
            MemoryMb = process.WorkingSet64 / 1024 / 1024,
            ThreadPoolQueued = ThreadPool.PendingWorkItemCount,
            Checks =
            [
                await TimedAsync("Database", async () => await _db.Database.CanConnectAsync(cancellationToken)),
                // A HEAD on a missing blob still proves Azure Blob Storage answers.
                await TimedAsync("Blob storage", async () =>
                {
                    await _blob.GetPropertiesAsync("__backend-check__", cancellationToken);
                    return true;
                })
            ],
            Routes = routes,
            RecentServerErrors = _metrics.RecentErrors()
        });
    }

    private static async Task<HealthCheckResult> TimedAsync(string name, Func<Task<bool>> probe)
    {
        var started = Stopwatch.GetTimestamp();
        try
        {
            var ok = await probe();
            return new HealthCheckResult(name, ok, Stopwatch.GetElapsedTime(started).TotalMilliseconds, null);
        }
        catch (Exception ex)
        {
            // Type only: messages can contain connection details.
            return new HealthCheckResult(name, false, Stopwatch.GetElapsedTime(started).TotalMilliseconds, ex.GetType().Name);
        }
    }
}

public sealed class BackendCheckResponse
{
    public DateTime StartedAt { get; set; }
    public long UptimeSeconds { get; set; }
    public long TotalRequests { get; set; }
    public long ClientErrors { get; set; }
    public long ServerErrors { get; set; }
    public long MemoryMb { get; set; }
    public long ThreadPoolQueued { get; set; }
    public IReadOnlyList<HealthCheckResult> Checks { get; set; } = [];
    public IReadOnlyList<RouteSnapshot> Routes { get; set; } = [];
    public IReadOnlyList<RecentServerError> RecentServerErrors { get; set; } = [];
}

public sealed record HealthCheckResult(string Name, bool Ok, double Ms, string? Error);
