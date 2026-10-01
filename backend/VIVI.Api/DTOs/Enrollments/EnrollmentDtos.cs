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
    public decimal ListPrice { get; set; }
    public decimal? Mrp { get; set; }
    public decimal Price { get; set; }
    public decimal ApplicablePrice { get; set; }
    /// <summary>ISO currency of the prices (INR or USD).</summary>
    public string Currency { get; set; } = "INR";
    /// <summary>False when the course is not sold in the caller's country.</summary>
    public bool AvailableInMarket { get; set; } = true;
    public bool IsLaunchOffer { get; set; }
    public bool LaunchOfferActive { get; set; }
    public int? LaunchOfferRemaining { get; set; }
    public int AccessDays { get; set; }
    public bool IsRenewalOffer { get; set; }
    public int? RenewalPercentage { get; set; }
}
