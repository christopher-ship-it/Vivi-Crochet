namespace VIVI.Core.Entities;

/// <summary>Reference from a <see cref="ShopSlot"/> to a catalog product. Never duplicates Product data.</summary>
public sealed class ShopSlotProduct
{
    public Guid Id { get; set; }
    public Guid SlotId { get; set; }
    public Guid ProductId { get; set; }
    public int DisplayOrder { get; set; }
    public bool IsActive { get; set; } = true;

    public ShopSlot? Slot { get; set; }
    public Product? Product { get; set; }
}
