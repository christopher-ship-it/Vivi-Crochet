namespace VIVI.Core.Entities;

/// <summary>
/// A course's price in a country other than India (India uses the prices on the course itself).
/// A course with no row for a country cannot be bought there.
/// </summary>
public sealed class CoursePrice
{
    public Guid Id { get; set; }
    public Guid CourseId { get; set; }
    /// <summary>ISO country code, e.g. US.</summary>
    public string CountryCode { get; set; } = string.Empty;
    /// <summary>ISO currency code, e.g. USD.</summary>
    public string Currency { get; set; } = string.Empty;
    /// <summary>Regular selling price.</summary>
    public decimal Price { get; set; }
    /// <summary>Optional list price shown struck through.</summary>
    public decimal? Mrp { get; set; }
    /// <summary>Founding-membership launch price for bundle courses with a launch offer. Null = no launch price here.</summary>
    public decimal? LaunchPrice { get; set; }
    /// <summary>Price once the launch offer ends or sells out (bundles with a launch offer). Null = use <see cref="Price"/>.</summary>
    public decimal? RegularPriceAfterLaunch { get; set; }
    /// <summary>Price a student pays here with a student code. Null = student codes are not available in this country.</summary>
    public decimal? StudentPrice { get; set; }
    public DateTime UpdatedAt { get; set; }

    public Course? Course { get; set; }
}
