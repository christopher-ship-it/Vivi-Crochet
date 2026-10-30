using System.Collections.Concurrent;

namespace VIVI.Api.Services;

/// <summary>
/// In-process request statistics for the admin "Backend check" page.
/// shortcut: memory only and per instance, so it resets on restart and ignores other instances;
/// use Application Insights / Azure Monitor for history, DTU and CPU.
/// </summary>
public sealed class RequestMetrics
{
    private const int SamplesPerRoute = 200;
    private const int RecentErrorCap = 20;

    private readonly ConcurrentDictionary<string, RouteStats> _routes = new();
    private readonly ConcurrentQueue<RecentServerError> _recent = new();

    public DateTime StartedAt { get; } = DateTime.UtcNow;

    public void Record(string route, int status, double durationMs, string? exceptionType)
    {
        _routes.GetOrAdd(route, _ => new RouteStats()).Add(status, durationMs);

        if (status < 500)
            return;
        _recent.Enqueue(new RecentServerError(DateTime.UtcNow, route, status, exceptionType));
        while (_recent.Count > RecentErrorCap && _recent.TryDequeue(out _)) { }
    }

    public IReadOnlyList<RouteSnapshot> Routes() =>
        _routes.Select(kv => kv.Value.Snapshot(kv.Key)).ToList();

    public IReadOnlyList<RecentServerError> RecentErrors() => _recent.Reverse().ToList();

    private sealed class RouteStats
    {
        private readonly object _gate = new();
        private readonly double[] _samples = new double[SamplesPerRoute];
        private long _count, _clientErrors, _serverErrors;
        private double _totalMs, _maxMs;

        public void Add(int status, double ms)
        {
            lock (_gate)
            {
                _samples[_count % SamplesPerRoute] = ms;
                _count++;
                _totalMs += ms;
                if (ms > _maxMs) _maxMs = ms;
                if (status >= 500) _serverErrors++;
                else if (status >= 400) _clientErrors++;
            }
        }

        public RouteSnapshot Snapshot(string route)
        {
            lock (_gate)
            {
                var recent = _samples.Take((int)Math.Min(_count, SamplesPerRoute)).OrderBy(x => x).ToArray();
                var p95 = recent.Length == 0 ? 0 : recent[(int)Math.Ceiling(recent.Length * 0.95) - 1];
                return new RouteSnapshot(route, _count, _clientErrors, _serverErrors, _totalMs / Math.Max(_count, 1), p95, _maxMs);
            }
        }
    }
}

public sealed record RouteSnapshot(
    string Route, long Count, long ClientErrors, long ServerErrors, double AvgMs, double P95Ms, double MaxMs);

public sealed record RecentServerError(DateTime At, string Route, int Status, string? ExceptionType);
