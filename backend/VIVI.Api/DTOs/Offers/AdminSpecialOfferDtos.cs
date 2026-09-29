namespace VIVI.Api.DTOs.Offers;

public sealed class AdminSpecialOfferResponse
{
    public Guid CourseId { get; set; }
    public string OfferName { get; set; } = string.Empty;
    public string PriceLabel { get; set; } = "Launch price";
    public string? BadgeText { get; set; }
    public string? EndedBadgeText { get; set; }
    public bool IsActive { get; set; }
    public int LaunchPrice { get; set; }
    public int LaunchLimit { get; set; }
    public int RegularPriceAfterLaunch { get; set; }
    public int Mrp { get; set; }
    public int AccessDurationDays { get; set; }
    public int CompletedPurchaseCount { get; set; }
    public int Remaining { get; set; }
    public decimal Revenue { get; set; }
    public Guid? ViralProjectCourseId { get; set; }
    public string? ViralProjectCourseName { get; set; }
    public IReadOnlyList<AdminSpecialOfferCourseResponse> IncludedCourses { get; set; } = [];
}

public sealed class AdminSpecialOfferCourseResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public int Price { get; set; }
}

public sealed class AdminSpecialOfferRequest
{
    public string OfferName { get; set; } = string.Empty;
    /// <summary>Caption for the launch price. Blank keeps the current label.</summary>
    public string? PriceLabel { get; set; }
    /// <summary>App badge while the offer is live. Blank resets to the app default.</summary>
    public string? BadgeText { get; set; }
    /// <summary>App badge after the offer ends. Blank resets to the app default.</summary>
    public string? EndedBadgeText { get; set; }
    public bool IsActive { get; set; }
    public int LaunchPrice { get; set; }
    public int LaunchLimit { get; set; }
    public int RegularPriceAfterLaunch { get; set; }
    public int Mrp { get; set; }
    public int AccessDurationDays { get; set; }
    public Guid? ViralProjectCourseId { get; set; }
}

public sealed class AdminFoundingMemberListItemResponse
{
    public Guid Id { get; set; }
    public int MemberNumber { get; set; }
    public string CustomerName { get; set; } = string.Empty;
    public string CustomerEmail { get; set; } = string.Empty;
    public string? CustomerPhone { get; set; }
    public DateTime JoinedDate { get; set; }
    public DateTime ExpiryDate { get; set; }
    public int AmountPaid { get; set; }
    public string OrderNumber { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public string? ViralProjectCourseName { get; set; }
}

public sealed class AdminFoundingMemberListResponse
{
    public int TotalCount { get; set; }
    public int Page { get; set; }
    public int PageSize { get; set; }
    public IReadOnlyList<AdminFoundingMemberListItemResponse> Items { get; set; } = [];
}
