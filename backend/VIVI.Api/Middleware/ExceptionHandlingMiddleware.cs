using System.Text.Json;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using VIVI.Api.DTOs;
using VIVI.Core.Exceptions;

namespace VIVI.Api.Middleware;

public sealed class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    public ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            await WriteErrorAsync(context, ex);
        }
    }

    private async Task WriteErrorAsync(HttpContext context, Exception exception)
    {
        IReadOnlyDictionary<string, object?>? details = null;
        var (status, code, message) = exception switch
        {
            ViviException v => Capture(v, out details),
            ValidationException v => (400, "VALIDATION_ERROR", string.Join(" ", v.Errors.Select(e => e.ErrorMessage))),
            UnauthorizedAccessException => (401, "UNAUTHORIZED", "Authentication is required."),
            DbUpdateConcurrencyException => (
                409,
                "CONCURRENCY_CONFLICT",
                "This record changed while you were editing it. Reload the page and try again."),
            DbUpdateException => (
                409,
                "DELETE_FAILED",
                "This record could not be deleted because it is still referenced elsewhere."),
            _ => (500, "UNEXPECTED_ERROR", "An unexpected error occurred.")
        };

        if (status >= 500)
            _logger.LogError(exception, "Unhandled exception");
        else
            _logger.LogInformation(exception, "Request failed with {Code}", code);

        context.Response.StatusCode = status;
        context.Response.ContentType = "application/json";

        object payload = details is { Count: > 0 }
            ? new ErrorResponseWithDetails(code, message, details)
            : new ErrorResponse(code, message);

        await context.Response.WriteAsync(JsonSerializer.Serialize(payload, JsonOptions));
    }

    private static (int Status, string Code, string Message) Capture(
        ViviException v,
        out IReadOnlyDictionary<string, object?>? details)
    {
        details = v.Details;
        return (v.StatusCode, v.Code, v.Message);
    }
}
