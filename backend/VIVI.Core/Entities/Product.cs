using VIVI.Core.Enums;

namespace VIVI.Core.Entities;

public sealed class Product
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int Price { get; set; }
    public int? Mrp { get; set; }
    public string? ImageUrl { get; set; }
    public string? Spec1 { get; set; }
    public string? Spec2 { get; set; }
    public Guid? CourseId { get; set; }
    public int SortOrder { get; set; }
    /// <summary>Units currently available to sell. Deducted once on successful payment fulfillment.</summary>
    public int AvailableStock { get; set; }
    public ProductType ProductType { get; set; } = ProductType.Handmade;
    public ProductStatus Status { get; set; } = ProductStatus.Draft;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public Course? Course { get; set; }
    public ICollection<ProductImage> Images { get; set; } = new List<ProductImage>();
}
