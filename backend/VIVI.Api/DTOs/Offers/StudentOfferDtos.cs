namespace VIVI.Api.DTOs.Offers;

public sealed class ValidateStudentCodeRequest
{
    public string Code { get; set; } = string.Empty;
}

public sealed class ValidateStudentCodeResponse
{
    public bool Valid { get; set; } = true;
    /// <summary>The student price in the buyer's currency.</summary>
    public decimal Price { get; set; }
    public string Currency { get; set; } = "INR";
    public int AccessDurationDays { get; set; }
}

public sealed class AdminStudentCodeResponse
{
    public Guid Id { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public int? MaxUses { get; set; }
    public int UsedCount { get; set; }
    public DateTime? ExpiresAt { get; set; }
    public bool IsExpired { get; set; }
    public DateTime CreatedAt { get; set; }
}

public sealed class AdminStudentOfferResponse
{
    public Guid CourseId { get; set; }
    public int StudentPrice { get; set; }
    /// <summary>Student price in dollars for US buyers, or null when student codes are not available in the US.</summary>
    public decimal? StudentPriceUsd { get; set; }
    /// <summary>True once the membership has a US price row, which a US student price needs.</summary>
    public bool UsPriceConfigured { get; set; }
    public int AccessDurationDays { get; set; }
    /// <summary>Students enrolled so far. Not part of the launch offer's 100.</summary>
    public int EnrolledCount { get; set; }
    /// <summary>Revenue in rupees (orders paid in INR).</summary>
    public decimal Revenue { get; set; }
    /// <summary>Revenue in dollars (orders paid in USD).</summary>
    public decimal RevenueUsd { get; set; }
    public IReadOnlyList<AdminStudentCodeResponse> Codes { get; set; } = [];
}

public sealed class AdminStudentSettingsRequest
{
    public int StudentPrice { get; set; }
    /// <summary>Dollar student price for US buyers. Null removes it (student codes stop working in the US).</summary>
    public decimal? StudentPriceUsd { get; set; }
}

public sealed class AdminStudentCodeRequest
{
    /// <summary>Leave blank on create to generate one like VIVISTUDENT4821.</summary>
    public string? Code { get; set; }
    public string Label { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public int? MaxUses { get; set; }
    public DateTime? ExpiresAt { get; set; }
}

public sealed class AdminStudentMemberResponse
{
    public Guid Id { get; set; }
    public int MemberNumber { get; set; }
    /// <summary>Student member ID, e.g. VS-KQTD-007.</summary>
    public string? MemberCode { get; set; }
    public string? CustomerCode { get; set; }
    public string CustomerName { get; set; } = string.Empty;
    public string CustomerEmail { get; set; } = string.Empty;
    public string? CustomerPhone { get; set; }
    public string? StudentCode { get; set; }
    public string? StudentLabel { get; set; }
    public DateTime JoinedDate { get; set; }
    public DateTime ExpiryDate { get; set; }
    public decimal AmountPaid { get; set; }
    public string Currency { get; set; } = "INR";
    public string OrderNumber { get; set; } = string.Empty;
    public bool IsActive { get; set; }
}

public sealed class AdminStudentMemberListResponse
{
    public int TotalCount { get; set; }
    public int Page { get; set; }
    public int PageSize { get; set; }
    public IReadOnlyList<AdminStudentMemberResponse> Items { get; set; } = [];
}
