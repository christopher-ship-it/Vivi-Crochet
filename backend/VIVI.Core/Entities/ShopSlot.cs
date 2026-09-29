using VIVI.Core.Enums;

namespace VIVI.Core.Entities;

/// <summary>
/// Admin-curated shop merchandising group (e.g. "Yarn"). One slot references many products
/// of a single room (ProductType). Independent of Product.Category and ProductEssentialLink.
/// </summary>
public sealed class ShopSlot
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public ProductType ProductType { get; set; }
    public int DisplayOrder { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public ICollection<ShopSlotProduct> Products { get; set; } = new List<ShopSlotProduct>();
}
