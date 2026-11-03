using System.Globalization;
using System.Text.RegularExpressions;

namespace VIVI.Infrastructure.Commerce;

/// <summary>Converts a class time typed in India time (IST) into US Eastern time for the class plan email.</summary>
public static class LiveClassTime
{
    // 24-hour "08:00 – 10:00" (what the admin picks) or the older "10:00 AM – 12:00 PM".
    private static readonly Regex Range = new(
        @"^\s*(\d{1,2}):(\d{2})\s*(AM|PM)?\s*[–-]\s*(\d{1,2}):(\d{2})\s*(AM|PM)?\s*$",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    /// <summary>
    /// "08:00 – 10:00" on <paramref name="day"/> in India becomes "9:30 PM – 11:30 PM Eastern Time (US)".
    /// Returns null when the text is not a plain range, so the email simply leaves the US line out.
    /// </summary>
    public static string? ToUsEastern(string indiaTime, DateOnly day)
    {
        var match = Range.Match(indiaTime ?? string.Empty);
        if (!match.Success)
            return null;

        var start = ToTime(match.Groups[1].Value, match.Groups[2].Value, match.Groups[3].Value);
        var end = ToTime(match.Groups[4].Value, match.Groups[5].Value, match.Groups[6].Value);
        var india = ResolveZone("India Standard Time", "Asia/Kolkata");
        var eastern = ResolveZone("Eastern Standard Time", "America/New_York");

        var from = ConvertOnDay(start, day, india, eastern);
        var to = ConvertOnDay(end, day, india, eastern);
        return $"{Format(from)} – {Format(to)} Eastern Time (US)";
    }

    private static DateTime ConvertOnDay(TimeOnly time, DateOnly day, TimeZoneInfo from, TimeZoneInfo to)
    {
        var local = day.ToDateTime(time, DateTimeKind.Unspecified);
        return TimeZoneInfo.ConvertTime(local, from, to);
    }

    private static TimeOnly ToTime(string hour, string minute, string period)
    {
        var h = int.Parse(hour, CultureInfo.InvariantCulture);
        if (period.Length > 0)
        {
            // 12-hour text: 12 AM is midnight, 12 PM is noon.
            h %= 12;
            if (period.Equals("PM", StringComparison.OrdinalIgnoreCase))
                h += 12;
        }
        return new TimeOnly(h, int.Parse(minute, CultureInfo.InvariantCulture));
    }

    private static string Format(DateTime value) =>
        value.ToString("h:mm tt", CultureInfo.InvariantCulture);

    private static TimeZoneInfo ResolveZone(string windowsId, string ianaId)
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(windowsId);
        }
        catch (TimeZoneNotFoundException)
        {
            return TimeZoneInfo.FindSystemTimeZoneById(ianaId);
        }
    }
}
