namespace VIVI.Api.DTOs;

public sealed record ErrorResponse(string Code, string Message);

public sealed record ErrorResponseWithDetails(
    string Code,
    string Message,
    IReadOnlyDictionary<string, object?> Details);
