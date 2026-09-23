namespace VIVI.Infrastructure.Configuration;

public sealed class LiveStudioOptions
{
    public const string SectionName = "LiveStudio";

    /// <summary>Package price in INR. Mobile must not override this.</summary>
    public decimal PackagePrice { get; set; } = 999m;

    /// <summary>Max seats per Morning or Evening circle (final studio rule: 4).</summary>
    public int DefaultSeatCapacity { get; set; } = 4;

    public int ReservationMinutes { get; set; } = 15;

    /// <summary>Monday that starts Week 1 of the season (yyyy-MM-dd).</summary>
    public string SeasonStartMonday { get; set; } = "2026-01-05";

    public string MorningSlotName { get; set; } = "Morning Crochet Circle";

    public string EveningSlotName { get; set; } = "Evening Crochet Circle";

    /// <summary>Display hours for Morning Crochet Circle.</summary>
    public string MorningSlotHours { get; set; } = "10:00 AM – 12:00 PM";

    /// <summary>Display hours for Evening Crochet Circle.</summary>
    public string EveningSlotHours { get; set; } = "6:00 PM – 8:00 PM";

    /// <summary>Hours of live class per weekday session.</summary>
    public int HoursPerClassDay { get; set; } = 2;

    /// <summary>Regular class days Monday–Friday.</summary>
    public int ClassDaysPerWeek { get; set; } = 5;

    /// <summary>Total live hours per booked week (5 × 2).</summary>
    public int WeeklyLiveHours { get; set; } = 10;

    /// <summary>
    /// How many upcoming open weeks customers may see/book.
    /// Current week is open only until Monday Morning Circle start (IST);
    /// after that the window starts at next Monday. Default 2.
    /// </summary>
    public int CustomerSelectableWeekCount { get; set; } = 2;
}
