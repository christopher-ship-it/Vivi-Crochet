using System.Collections.Generic;

namespace VIVI.Core.Exceptions;

public sealed class ViviException : Exception
{
    public string Code { get; }
    public int StatusCode { get; }
    public IReadOnlyDictionary<string, object?>? Details { get; }

    public ViviException(
        string code,
        string message,
        int statusCode = 400,
        IReadOnlyDictionary<string, object?>? details = null)
        : base(message)
    {
        Code = code;
        StatusCode = statusCode;
        Details = details;
    }

    public static ViviException NotFound(string code, string message) =>
        new(code, message, 404);

    public static ViviException Conflict(
        string code,
        string message,
        IReadOnlyDictionary<string, object?>? details = null) =>
        new(code, message, 409, details);

    public static ViviException Unauthorized(string code, string message) =>
        new(code, message, 401);

    public static ViviException Forbidden(string code, string message) =>
        new(code, message, 403);

    public static ViviException InsufficientStock(int availableStock) =>
        Conflict(
            "INSUFFICIENT_STOCK",
            availableStock <= 0
                ? "This product is out of stock."
                : $"Only {availableStock} available.",
            new Dictionary<string, object?> { ["availableStock"] = availableStock });
}
