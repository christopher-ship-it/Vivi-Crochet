using VIVI.Core.Enums;

namespace VIVI.Core.Entities;

public sealed class AdminUser
{
    public Guid Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public UserRole Role { get; set; } = UserRole.Admin;
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public ICollection<Course> CreatedCourses { get; set; } = new List<Course>();
    public ICollection<Video> CreatedVideos { get; set; } = new List<Video>();
    public Customer? CustomerProfile { get; set; }
}
