namespace VIVI.Infrastructure.Configuration;

public sealed class LiveStudioOptions
{
    public const string SectionName = "LiveStudio";

    /// <summary>Package price in INR. Mobile must not override this.</summary>
    public decimal PackagePrice { get; set; } = 999m;

    public int DefaultSeatCapacity { get; set; } = 5;

    public int ReservationMinutes { get; set; } = 15;

    /// <summary>Monday that starts Week 1 of the season (yyyy-MM-dd).</summary>
    public string SeasonStartMonday { get; set; } = "2026-01-05";

    public string MorningSlotName { get; set; } = "Morning Crochet Circle";

    public string EveningSlotName { get; set; } = "Evening Crochet Circle";
}
