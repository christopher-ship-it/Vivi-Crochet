namespace VIVI.Api.DTOs.Enrollments;

public sealed class EnrollmentResponse
{
    public Guid Id { get; set; }
    public Guid CourseId { get; set; }
    public string CourseName { get; set; } = string.Empty;
    public DateTime PurchaseDate { get; set; }
    public DateTime AccessStartDate { get; set; }
    public DateTime AccessExpiryDate { get; set; }
    public bool IsActive { get; set; }
    public bool IsExpired { get; set; }
    public bool CompletedFlag { get; set; }
    public DateTime? CompletedAt { get; set; }
}

public sealed class CoursePricingResponse
{
    public Guid CourseId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string CourseName { get; set; } = string.Empty;
    public int ListPrice { get; set; }
    public int? Mrp { get; set; }
    public int Price { get; set; }
    public int ApplicablePrice { get; set; }
    public bool IsLaunchOffer { get; set; }
    public bool LaunchOfferActive { get; set; }
    public int? LaunchOfferRemaining { get; set; }
    public int AccessDays { get; set; }
}
