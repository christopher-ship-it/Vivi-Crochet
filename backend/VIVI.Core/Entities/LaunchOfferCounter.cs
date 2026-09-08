namespace VIVI.Core.Entities;

public sealed class LaunchOfferCounter
{
    public Guid Id { get; set; }
    public Guid CourseId { get; set; }
    public int LaunchLimit { get; set; } = 100;
    public int LaunchPrice { get; set; }
    public int RegularPriceAfterLaunch { get; set; }
    public int Mrp { get; set; }
    public int CompletedPurchaseCount { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public Course? Course { get; set; }
}
