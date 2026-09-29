using VIVI.Api.DTOs.Shop;
using VIVI.Core.Entities;
using VIVI.Core.Enums;

namespace VIVI.Api.Mapping;

public static class ShopSlotMapper
{
    /// <summary>
    /// Maps a slot (with ShopSlotProducts → Product → Images loaded). Public callers only get active links to
    /// published products of the slot's own room; admin callers get every linked product.
    /// </summary>
    public static ShopSlotResponse ToDto(this ShopSlot slot, bool adminView)
    {
        var products = slot.Products
            .Where(l => l.Product is not null)
            .Where(l => adminView
                || (l.IsActive
                    && l.Product!.Status == ProductStatus.Published
                    && l.Product.ProductType == slot.ProductType))
            .OrderBy(l => l.DisplayOrder)
            .Select(l => l.Product!.ToDto(adminView))
            .ToList();

        return new ShopSlotResponse
        {
            SlotId = slot.Id,
            SlotName = slot.Name,
            ProductType = slot.ProductType,
            DisplayOrder = slot.DisplayOrder,
            IsActive = slot.IsActive,            ProductCount = products.Count,
            CreatedAt = slot.CreatedAt,
            UpdatedAt = slot.UpdatedAt,
            Products = products
        };
    }
}
