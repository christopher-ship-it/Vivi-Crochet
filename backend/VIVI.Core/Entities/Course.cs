using VIVI.Core.Enums;

namespace VIVI.Core.Entities;

public sealed class Course
{
    public Guid Id { get; set; }
    public Guid? CategoryId { get; set; }
    public string Name { get; set; } = string.Empty;
    public CourseType Type { get; set; } = CourseType.DigitalCourse;
    public string? Level { get; set; }
    public string? About { get; set; }
    public int Price { get; set; }
    public int? Mrp { get; set; }
    public int AccessDays { get; set; } = 30;
    public byte RenewalPercentage { get; set; } = 50;
    public string? Languages { get; set; }
    public CourseStatus Status { get; set; } = CourseStatus.Draft;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public Guid CreatedBy { get; set; }

    public Category? Category { get; set; }
    public AdminUser? CreatedByUser { get; set; }
    public ICollection<Video> Videos { get; set; } = new List<Video>();
    public ICollection<CourseBundleItem> BundleItems { get; set; } = new List<CourseBundleItem>();
    public ICollection<CourseBundleItem> IncludedInBundles { get; set; } = new List<CourseBundleItem>();
    public LaunchOfferCounter? LaunchOffer { get; set; }
}
