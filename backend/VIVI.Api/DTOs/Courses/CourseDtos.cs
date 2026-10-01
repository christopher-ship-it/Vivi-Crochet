using VIVI.Core.Enums;

namespace VIVI.Api.DTOs.Courses;

public sealed class CourseRequest
{
    public string Name { get; set; } = string.Empty;
    public Guid? CategoryId { get; set; }
    public CourseType Type { get; set; } = CourseType.DigitalCourse;
    public string? Level { get; set; }
    /// <summary>Short copy for Home Viral / Trending hero slides.</summary>
    public string? Description { get; set; }
    public string? About { get; set; }
    public int Price { get; set; }
    public int? Mrp { get; set; }
    public int AccessDays { get; set; } = 30;
    public byte RenewalPercentage { get; set; } = 50;
    public string? Languages { get; set; }
    /// <summary>Lower values appear first in Viral / Trending / home discovery.</summary>
    public int SortOrder { get; set; }
    public IReadOnlyList<Guid>? IncludedCourseIds { get; set; }
    /// <summary>
    /// Prices for countries other than India (e.g. US in USD). Null = leave as is; a list replaces the
    /// saved set, so a country left out of it is no longer sold there.
    /// </summary>
    public IReadOnlyList<CoursePriceDto>? MarketPrices { get; set; }
    public int? LaunchPrice { get; set; }
    public int? LaunchLimit { get; set; }
    public int? RegularPriceAfterLaunch { get; set; }
}

public sealed class CourseResponse
{
    public Guid Id { get; set; }
    public Guid? CategoryId { get; set; }
    public string? CategoryName { get; set; }
    public string Name { get; set; } = string.Empty;
    public CourseType Type { get; set; }
    public string? Level { get; set; }
    /// <summary>Short copy for Home Viral / Trending hero slides.</summary>
    public string? Description { get; set; }
    public string? About { get; set; }
    /// <summary>Price in <see cref="Currency"/> for the caller's country.</summary>
    public decimal Price { get; set; }
    public decimal? Mrp { get; set; }
    /// <summary>ISO currency of <see cref="Price"/> (INR or USD).</summary>
    public string Currency { get; set; } = "INR";
    /// <summary>False when the course has no price for the caller's country and cannot be bought there.</summary>
    public bool AvailableInMarket { get; set; } = true;
    public int AccessDays { get; set; }
    public byte RenewalPercentage { get; set; }
    public string? Languages { get; set; }
    /// <summary>Resolved read URL for the course cover thumbnail.</summary>
    public string? ThumbnailUrl { get; set; }
    public int SortOrder { get; set; }
    public CourseStatus Status { get; set; }
    public int VideoCount { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public Guid CreatedBy { get; set; }
    public IReadOnlyList<CourseLessonResponse>? Lessons { get; set; }
    public IReadOnlyList<IncludedCourseResponse>? IncludedCourses { get; set; }
    public LaunchOfferAdminResponse? LaunchOffer { get; set; }
    /// <summary>Admin only: the saved prices for countries other than India.</summary>
    public IReadOnlyList<CoursePriceDto>? MarketPrices { get; set; }
}

/// <summary>A course's price in one non-India country.</summary>
public sealed class CoursePriceDto
{
    /// <summary>US.</summary>
    public string CountryCode { get; set; } = string.Empty;
    public string Currency { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public decimal? Mrp { get; set; }
    /// <summary>Founding-membership launch price (bundles with a launch offer only).</summary>
    public decimal? LaunchPrice { get; set; }
    public decimal? RegularPriceAfterLaunch { get; set; }
}

public sealed class IncludedCourseResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public int AccessDays { get; set; }
    public int VideoCount { get; set; }
}

public sealed class LaunchOfferAdminResponse
{
    public int LaunchPrice { get; set; }
    public int LaunchLimit { get; set; }
    public int RegularPriceAfterLaunch { get; set; }
    public int Mrp { get; set; }
    public int CompletedPurchaseCount { get; set; }
}

public sealed class CourseThumbnailUploadUrlRequest
{
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long FileSizeBytes { get; set; }
}

public sealed class CourseThumbnailUploadUrlResponse
{
    public string UploadUrl { get; set; } = string.Empty;
    public DateTimeOffset ExpiresAt { get; set; }
    public string BlobPath { get; set; } = string.Empty;
    public long MaxFileSizeBytes { get; set; }
}

public sealed class CourseThumbnailUploadCompleteRequest
{
    public string BlobPath { get; set; } = string.Empty;
    public long FileSizeBytes { get; set; }
    public string ContentType { get; set; } = string.Empty;
}

public sealed class CourseLessonResponse
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int? DurationSeconds { get; set; }
    public bool IsFreePreview { get; set; }
    public int SortOrder { get; set; }
    public VIVI.Core.Enums.VideoStatus Status { get; set; }
}
