namespace VIVI.Core.Entities;

/// <summary>
/// Something a customer was looking for in the app and could not find, sent from the in-app prompt
/// that appears after they have been in the app for a while. The phone number lets the team reply.
/// </summary>
public sealed class AppFeedback
{
    public Guid Id { get; set; }
    /// <summary>What the customer was looking for, in their own words.</summary>
    public string? Message { get; set; }
    /// <summary>Phone number the customer gave so the team can reply.</summary>
    public string? Phone { get; set; }
    public string? Screen { get; set; }
    public string? AppVersion { get; set; }
    public string? Platform { get; set; }
    /// <summary>How long the customer had been in the app before the prompt was answered.</summary>
    public int SecondsInApp { get; set; }
    public DateTime CreatedAt { get; set; }
    public bool IsResolved { get; set; }
    public DateTime? ResolvedAt { get; set; }
}
