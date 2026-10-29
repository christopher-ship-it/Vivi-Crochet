namespace VIVI.Core;

/// <summary>"What you learn" points are stored as one line per topic.</summary>
public static class CourseTopics
{
    public static string? Normalize(string? raw)
    {
        var lines = Split(raw);
        return lines.Count == 0 ? null : string.Join('\n', lines);
    }

    public static IReadOnlyList<string> Split(string? raw) =>
        (raw ?? string.Empty)
            .Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .ToList();
}
