namespace VIVI.Core.Entities;

/// <summary>A crash or bug report sent automatically (or manually) by the mobile app.</summary>
public sealed class AppIssue
{
    public Guid Id { get; set; }
    /// <summary>Signed-in user (AdminUsers.Id) when the report was sent; null for guests.</summary>
    public Guid? UserId { get; set; }
    /// <summary><c>Crash</c>, <c>Bug</c> or <c>Buffering</c>.</summary>
    public string Kind { get; set; } = AppIssueKinds.Crash;
    public string Title { get; set; } = string.Empty;
    public string? Details { get; set; }
    public string? Screen { get; set; }
    public string? AppVersion { get; set; }
    public string? Platform { get; set; }
    public string? DeviceInfo { get; set; }
    public bool IsFatal { get; set; }
    public DateTime CreatedAt { get; set; }
    public bool IsResolved { get; set; }
    public DateTime? ResolvedAt { get; set; }
}

public static class AppIssueKinds
{
    public const string Crash = "Crash";
    public const string Bug = "Bug";
    /// <summary>Video stalled or took over 5 seconds to start.</summary>
    public const string Buffering = "Buffering";

    public static bool IsValid(string? kind) => kind is Crash or Bug or Buffering;
}
