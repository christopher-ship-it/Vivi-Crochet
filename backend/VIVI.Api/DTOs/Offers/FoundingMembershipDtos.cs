namespace VIVI.Api.DTOs.Offers;

/// <summary>Public, server-authoritative state of the ₹999 Launch Offer / Founding Membership. Nothing here is client-editable.</summary>
public sealed class FoundingMembershipOfferResponse
{
    public Guid CourseId { get; set; }
    public string OfferName { get; set; } = string.Empty;
    public string PriceLabel { get; set; } = "Launch price";
    public string? BadgeText { get; set; }
    public string? EndedBadgeText { get; set; }
    public bool IsActive { get; set; }
    public decimal LaunchPrice { get; set; }
    public decimal RegularPriceAfterLaunch { get; set; }
    public decimal Mrp { get; set; }
    /// <summary>ISO currency of the prices above (INR or USD).</summary>
    public string Currency { get; set; } = "INR";
    /// <summary>False when the membership has no price for the caller's country.</summary>
    public bool AvailableInMarket { get; set; } = true;
    public int LaunchLimit { get; set; }
    public int CompletedPurchaseCount { get; set; }
    public int Remaining { get; set; }
    public int AccessDurationDays { get; set; }
    public IReadOnlyList<FoundingMembershipCourseResponse> IncludedCourses { get; set; } = [];
    public FoundingMembershipViralProjectResponse? ViralProject { get; set; }
    public IReadOnlyList<string> Benefits { get; set; } = [];
}

public sealed class FoundingMembershipCourseResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public decimal RegularPrice { get; set; }
}

public sealed class FoundingMembershipViralProjectResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? ThumbnailUrl { get; set; }
}

/// <summary>The authenticated customer's founding-membership status, if any.</summary>
public sealed class MyMembershipResponse
{
    public bool IsMember { get; set; }
    public int? MemberNumber { get; set; }
    /// <summary>Founding-member ID, e.g. VV-KQTD-007.</summary>
    public string? MemberCode { get; set; }
    /// <summary>True for a student-code membership (numbered separately from the launch members).</summary>
    public bool IsStudent { get; set; }
    public string? OfferName { get; set; }
    public DateTime? BadgeGrantedAt { get; set; }
    public DateTime? AccessExpiryDate { get; set; }
    public bool? IsActive { get; set; }
    public FoundingMembershipViralProjectResponse? ViralProject { get; set; }
}
