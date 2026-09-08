namespace VIVI.Core.Entities;

public sealed class CourseBundleItem
{
    public Guid Id { get; set; }
    public Guid BundleCourseId { get; set; }
    public Guid IncludedCourseId { get; set; }
    public int SortOrder { get; set; }
    public DateTime CreatedAt { get; set; }

    public Course? BundleCourse { get; set; }
    public Course? IncludedCourse { get; set; }
}
