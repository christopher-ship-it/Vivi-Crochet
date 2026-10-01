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
    /// <summary>Revenue in rupees (orders paid in INR).</summary>
    public decimal Revenue { get; set; }
    /// <summary>Revenue in dollars (orders paid in USD).</summary>
    public decimal RevenueUsd { get; set; }
    public Guid? ViralProjectCourseId { get; set; }
    public string? ViralProjectCourseName { get; set; }
    /// <summary>The membership's US prices in USD, or null when it is not sold in the US.</summary>
    public AdminSpecialOfferMarketPrice? UsPrice { get; set; }
    public IReadOnlyList<AdminSpecialOfferCourseResponse> IncludedCourses { get; set; } = [];
}

/// <summary>The founding membership's price in another country.</summary>
public sealed class AdminSpecialOfferMarketPrice
{
    public decimal LaunchPrice { get; set; }
    public decimal RegularPriceAfterLaunch { get; set; }
    public decimal Mrp { get; set; }
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
    /// <summary>
    /// US prices in USD. Null leaves them unchanged; send a value to sell the membership in the US
    /// (or set <see cref="RemoveUsPrice"/> to stop selling it there).
    /// </summary>
    public AdminSpecialOfferMarketPrice? UsPrice { get; set; }
    public bool RemoveUsPrice { get; set; }
}

public sealed class AdminFoundingMemberListItemResponse
{
    public Guid Id { get; set; }
    public int MemberNumber { get; set; }
    /// <summary>Founding-member ID, e.g. VV-KQTD-007.</summary>
    public string? MemberCode { get; set; }
    /// <summary>The member's customer ID, e.g. VC-K7M2QX.</summary>
    public string? CustomerCode { get; set; }
    public string CustomerName { get; set; } = string.Empty;
    public string CustomerEmail { get; set; } = string.Empty;
    public string? CustomerPhone { get; set; }
    public DateTime JoinedDate { get; set; }
    public DateTime ExpiryDate { get; set; }
    public decimal AmountPaid { get; set; }
    /// <summary>Currency the member paid in (INR or USD).</summary>
    public string Currency { get; set; } = "INR";
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
