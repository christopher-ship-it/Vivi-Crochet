namespace VIVI.Core.Entities;

/// <summary>
/// A code an admin hands to students (e.g. <c>VIVISTUDENT2417</c>). Redeeming it at checkout buys the
/// founding bundle at <see cref="LaunchOfferCounter.StudentPrice"/> without using one of the launch slots.
/// </summary>
public sealed class StudentCode
{
    public Guid Id { get; set; }
    /// <summary>Upper-case code without spaces; matched ignoring case, spaces and dashes.</summary>
    public string Code { get; set; } = string.Empty;
    /// <summary>Who the code is for (e.g. a college name). Shown in admin only.</summary>
    public string Label { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    /// <summary>Maximum number of purchases for this code. Null means unlimited.</summary>
    public int? MaxUses { get; set; }
    public int UsedCount { get; set; }
    public DateTime? ExpiresAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
