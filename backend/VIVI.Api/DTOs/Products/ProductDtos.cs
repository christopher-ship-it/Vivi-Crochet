using System.Text.Json.Serialization;
using VIVI.Core.Enums;

namespace VIVI.Api.DTOs.Products;

public sealed class ProductRequest
{
    public string Name { get; set; } = string.Empty;
    /// <summary>Optional unique product code (e.g. DIS039). Blank clears it.</summary>
    public string? ProductCode { get; set; }
    public string Category { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int Price { get; set; }
    public int? Mrp { get; set; }
    public string? Spec1 { get; set; }
    public string? Spec2 { get; set; }
    public string? BallWeight { get; set; }
    public string? YarnLength { get; set; }
    public string? CrochetHookSize { get; set; }
    public string? ColourName { get; set; }
    public string? ColourHex { get; set; }
    /// <summary>When set, creates/updates this product as a variant of the parent listing.</summary>
    public Guid? ParentProductId { get; set; }
    /// <summary>Option label on a parent listing (e.g. "Colour"). Ignored on variants.</summary>
    public string? VariantOptionName { get; set; }
    public Guid? CourseId { get; set; }
    public int SortOrder { get; set; }
    public ProductType ProductType { get; set; } = ProductType.Handmade;
    public int AvailableStock { get; set; }
    /// <summary>Configured Crochet Essentials product ids (Handmade only). Max 3.</summary>
    public IReadOnlyList<Guid>? RecommendedEssentialIds { get; set; }
}

/// <summary>Compact variant SKU shown under a parent listing.</summary>
public sealed class ProductVariantSummary
{
    public Guid Id { get; set; }
    public string? ProductCode { get; set; }
    public string? ColourName { get; set; }
    public string? ColourHex { get; set; }
    public int Price { get; set; }
    public int? Mrp { get; set; }
    public string? ImageUrl { get; set; }
    public int AvailableStock { get; set; }
    public ProductStatus Status { get; set; }
    public int SortOrder { get; set; }
}

public sealed class ProductImageUploadUrlRequest
{
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long FileSizeBytes { get; set; }
}

public sealed class ProductImageUploadUrlResponse
{
    public string UploadUrl { get; set; } = string.Empty;
    public DateTimeOffset ExpiresAt { get; set; }
    public string BlobPath { get; set; } = string.Empty;
    public long MaxFileSizeBytes { get; set; }
}

public sealed class ProductImageUploadCompleteRequest
{
    public string BlobPath { get; set; } = string.Empty;
    public long FileSizeBytes { get; set; }
    public string ContentType { get; set; } = string.Empty;
    /// <summary>When true, this image becomes the main shop image after upload.</summary>
    public bool SetAsMain { get; set; }
}

public sealed class ProductImageResponse
{
    public Guid Id { get; set; }
    public string Url { get; set; } = string.Empty;
    public string BlobPath { get; set; } = string.Empty;
    public int SortOrder { get; set; }
    public bool IsMain { get; set; }
}

public sealed class LinkedCourseSummary
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public int Price { get; set; }
    public int VideoCount { get; set; }
    public string? Level { get; set; }
}

public sealed class RecommendedEssentialSummary
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public int Price { get; set; }
    public string? ImageUrl { get; set; }
    public int AvailableStock { get; set; }
}

public sealed class ProductResponse
{
    public Guid Id { get; set; }
    public string? ProductCode { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int Price { get; set; }
    public int? Mrp { get; set; }
    /// <summary>Resolved URL of the main product image (backward compatible).</summary>
    public string? ImageUrl { get; set; }
    [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public IReadOnlyList<ProductImageResponse> Images { get; set; } = Array.Empty<ProductImageResponse>();
    public string? Spec1 { get; set; }
    public string? Spec2 { get; set; }
    public string? BallWeight { get; set; }
    public string? YarnLength { get; set; }
    public string? CrochetHookSize { get; set; }
    public string? ColourName { get; set; }
    public string? ColourHex { get; set; }
    public Guid? ParentProductId { get; set; }
    public string? VariantOptionName { get; set; }
    /// <summary>Number of variant SKUs (list views). Detail responses also populate <see cref="Variants"/>.</summary>
    public int VariantCount { get; set; }
    /// <summary>Ordered variant SKUs when this is a parent (or siblings when this is a variant).</summary>
    public IReadOnlyList<ProductVariantSummary> Variants { get; set; } = Array.Empty<ProductVariantSummary>();
    public Guid? CourseId { get; set; }
    public LinkedCourseSummary? LinkedCourse { get; set; }
    public int SortOrder { get; set; }
    public ProductType ProductType { get; set; }
    public int AvailableStock { get; set; }
    /// <summary>Alias of <see cref="AvailableStock"/>.</summary>
    public int Stock => AvailableStock;
    public ProductStatus Status { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    /// <summary>Configured Crochet Essentials for cart/product recommendations.</summary>
    public IReadOnlyList<RecommendedEssentialSummary> RecommendedEssentials { get; set; }
        = Array.Empty<RecommendedEssentialSummary>();
}
