using VIVI.Core.Enums;

namespace VIVI.Api.DTOs.Courses;

public sealed class CourseRequest
{
    public string Name { get; set; } = string.Empty;
    public Guid? CategoryId { get; set; }
    public CourseType Type { get; set; } = CourseType.DigitalCourse;
    public string? Level { get; set; }
    public string? About { get; set; }
    public int Price { get; set; }
    public int? Mrp { get; set; }
    public int AccessDays { get; set; } = 30;
    public byte RenewalPercentage { get; set; } = 50;
    public string? Languages { get; set; }
    public IReadOnlyList<Guid>? IncludedCourseIds { get; set; }
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
    public string? About { get; set; }
    public int Price { get; set; }
    public int? Mrp { get; set; }
    public int AccessDays { get; set; }
    public byte RenewalPercentage { get; set; }
    public string? Languages { get; set; }
    public CourseStatus Status { get; set; }
    public int VideoCount { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public Guid CreatedBy { get; set; }
    public IReadOnlyList<CourseLessonResponse>? Lessons { get; set; }
    public IReadOnlyList<IncludedCourseResponse>? IncludedCourses { get; set; }
    public LaunchOfferAdminResponse? LaunchOffer { get; set; }
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
