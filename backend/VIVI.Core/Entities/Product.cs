using VIVI.Core.Enums;

namespace VIVI.Core.Entities;

public sealed class Product
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    /// <summary>Optional merchandising/SKU code (e.g. DIS039). Unique when set. Not a key.</summary>
    public string? ProductCode { get; set; }
    public string Category { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int Price { get; set; }
    public int? Mrp { get; set; }
    public string? ImageUrl { get; set; }
    public string? Spec1 { get; set; }
    public string? Spec2 { get; set; }
    /// <summary>Crochet Essentials specification, e.g. "50 g".</summary>
    public string? BallWeight { get; set; }
    /// <summary>Crochet Essentials specification, e.g. "120 m".</summary>
    public string? YarnLength { get; set; }
    /// <summary>Crochet Essentials specification, e.g. "4 mm".</summary>
    public string? CrochetHookSize { get; set; }
    /// <summary>Variant option value (e.g. colour name "Cream").</summary>
    public string? ColourName { get; set; }
    /// <summary>Swatch colour as #RRGGBB for the colour picker in the app.</summary>
    public string? ColourHex { get; set; }
    /// <summary>
    /// When set, this product is a variant SKU of the parent listing.
    /// Parents appear in the shop; variants are selected on the product page.
    /// </summary>
    public Guid? ParentProductId { get; set; }
    /// <summary>Label for the variant dimension on a parent (e.g. "Colour"). Null on variants.</summary>
    public string? VariantOptionName { get; set; }
    public Guid? CourseId { get; set; }
    public int SortOrder { get; set; }
    /// <summary>Units currently available to sell. Deducted once on successful payment fulfillment.</summary>
    public int AvailableStock { get; set; }
    public ProductType ProductType { get; set; } = ProductType.Handmade;
    public ProductStatus Status { get; set; } = ProductStatus.Draft;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public Course? Course { get; set; }
    public Product? Parent { get; set; }
    public ICollection<Product> Variants { get; set; } = new List<Product>();
    public ICollection<ProductImage> Images { get; set; } = new List<ProductImage>();
    public ICollection<ProductEssentialLink> EssentialLinks { get; set; } = new List<ProductEssentialLink>();
}
