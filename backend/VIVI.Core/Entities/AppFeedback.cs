namespace VIVI.Core.Entities;

/// <summary>Feedback a customer gives from the in-app prompt shown after they have stayed in the app for a while.</summary>
public sealed class AppFeedback
{
    public Guid Id { get; set; }
    /// <summary>1 to 5 stars.</summary>
    public int Rating { get; set; }
    public string? Message { get; set; }
    public string? Screen { get; set; }
    public string? AppVersion { get; set; }
    public string? Platform { get; set; }
    /// <summary>How long the customer had been in the app before the prompt was answered.</summary>
    public int SecondsInApp { get; set; }
    public DateTime CreatedAt { get; set; }
    public bool IsResolved { get; set; }
    public DateTime? ResolvedAt { get; set; }
}
