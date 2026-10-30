using System.Diagnostics;
using Microsoft.AspNetCore.Routing;
using VIVI.Api.Services;

namespace VIVI.Api.Middleware;

/// <summary>Times every request and feeds <see cref="RequestMetrics"/>. Sits outside the exception middleware so it sees final status codes.</summary>
public sealed class RequestMetricsMiddleware
{
    public const string ExceptionTypeItem = "Vivi.ExceptionType";

    private readonly RequestDelegate _next;
    private readonly RequestMetrics _metrics;

    public RequestMetricsMiddleware(RequestDelegate next, RequestMetrics metrics)
    {
        _next = next;
        _metrics = metrics;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var started = Stopwatch.GetTimestamp();
        try
        {
            await _next(context);
        }
        finally
        {
            // Route templates, not raw paths, so ids and bot URLs cannot grow the table.
            var template = (context.GetEndpoint() as RouteEndpoint)?.RoutePattern.RawText;
            var route = $"{context.Request.Method} /{template?.TrimStart('/') ?? "(unmatched)"}";
            var exceptionType = context.Items[ExceptionTypeItem] as string;
            _metrics.Record(route, context.Response.StatusCode, Stopwatch.GetElapsedTime(started).TotalMilliseconds, exceptionType);
        }
    }
}
