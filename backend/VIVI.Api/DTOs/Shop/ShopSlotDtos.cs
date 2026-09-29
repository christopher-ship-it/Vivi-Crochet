using VIVI.Api.DTOs.Products;
using VIVI.Core.Enums;

namespace VIVI.Api.DTOs.Shop;

public sealed class ShopSlotRequest
{
    public string Name { get; set; } = string.Empty;
    public ProductType ProductType { get; set; } = ProductType.Handmade;
    public int DisplayOrder { get; set; }
    public bool IsActive { get; set; } = true;
}

public sealed class ShopSlotProductsRequest
{
    /// <summary>Ordered product ids. Position in the array becomes the DisplayOrder.</summary>
    public IReadOnlyList<Guid> ProductIds { get; set; } = Array.Empty<Guid>();
}

/// <summary>One slot with its products. Used by the public shop API and the admin API.</summary>
public sealed class ShopSlotResponse
{
    public Guid SlotId { get; set; }
    public string SlotName { get; set; } = string.Empty;
    public ProductType ProductType { get; set; }
    public int DisplayOrder { get; set; }
    public bool IsActive { get; set; }
    public int ProductCount { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    /// <summary>Full product payload (same shape as /api/products) in slot order.</summary>
    public IReadOnlyList<ProductResponse> Products { get; set; } = Array.Empty<ProductResponse>();
}
