namespace VIVI.Core.Entities;

public sealed class LaunchOfferCounter
{
    public Guid Id { get; set; }
    public Guid CourseId { get; set; }
    public string OfferName { get; set; } = "VIVI Founding Membership";
    public bool IsActive { get; set; } = true;
    /// <summary>Admin-editable caption for the launch price (e.g. "Founding price"). Defaults to "Launch price".</summary>
    public string PriceLabel { get; set; } = "Launch price";
    /// <summary>Optional app badge text while the offer is live (e.g. "LAUNCH OFFER · FIRST 100 USERS"). Null uses the app default.</summary>
    public string? BadgeText { get; set; }
    /// <summary>Optional app badge text once the offer has ended or sold out (e.g. "LAUNCH OFFER ENDED"). Null uses the app default.</summary>
    public string? EndedBadgeText { get; set; }
    public int LaunchLimit { get; set; } = 100;
    public int LaunchPrice { get; set; }
    public int RegularPriceAfterLaunch { get; set; }
    public int Mrp { get; set; }
    public int CompletedPurchaseCount { get; set; }
    /// <summary>Membership access window in days, applied to every course (and the viral project) granted by this offer — independent of each course's own AccessDays.</summary>
    public int AccessDurationDays { get; set; } = 365;
    /// <summary>The ProjectCourse ("Viral Project") granted free with this offer. Null if none configured.</summary>
    public Guid? ViralProjectCourseId { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public Course? Course { get; set; }
    public Course? ViralProjectCourse { get; set; }
}
