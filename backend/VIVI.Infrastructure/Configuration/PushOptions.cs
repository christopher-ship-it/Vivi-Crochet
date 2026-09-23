namespace VIVI.Infrastructure.Configuration;

public sealed class PushOptions
{
    public const string SectionName = "Push";

    /// <summary>Shared secret for POST /api/internal/jobs/weekly-push (X-Vivi-Job-Secret header).</summary>
    public string JobSecret { get; set; } = string.Empty;

    /// <summary>When false, Expo HTTP calls are skipped (tests / local without device).</summary>
    public bool Enabled { get; set; } = true;
}
