namespace VIVI.Core.Entities;

public sealed class Customer
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string PhoneNumber { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;

    /// <summary>Last saved delivery address used to prefill checkout.</summary>
    public string? ShipFullName { get; set; }
    public string? ShipPhone { get; set; }
    public string? ShipAddressLine1 { get; set; }
    public string? ShipAddressLine2 { get; set; }
    public string? ShipLandmark { get; set; }
    public string? ShipCity { get; set; }
    public string? ShipState { get; set; }
    public string? ShipPinCode { get; set; }
    public string? ShipCountry { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public AdminUser? User { get; set; }
    public ICollection<Order> Orders { get; set; } = new List<Order>();
    public ICollection<CourseEnrollment> Enrollments { get; set; } = new List<CourseEnrollment>();
}
