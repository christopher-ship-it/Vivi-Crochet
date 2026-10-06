namespace VIVI.Infrastructure.Configuration;

public sealed class OrderCancellationOptions
{
    public const string SectionName = "OrderCancellation";

    /// <summary>
    /// Hour of day (India time, 0-23) when the daily order batch closes. A paid order can be
    /// cancelled by the customer until the first cutoff after it was paid. Enforced on the server only.
    /// </summary>
    public int CutoffHourIst { get; set; } = 17;
}
