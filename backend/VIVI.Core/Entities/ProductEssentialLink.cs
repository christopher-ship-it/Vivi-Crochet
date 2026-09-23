namespace VIVI.Core.Entities;

/// <summary>
/// Admin-configured Crochet Essentials recommendation for a Handmade product.
/// Source = Handmade Collection; Essential = Resell product.
/// </summary>
public sealed class ProductEssentialLink
{
    public Guid Id { get; set; }
    public Guid SourceProductId { get; set; }
    public Guid EssentialProductId { get; set; }
    public int SortOrder { get; set; }

    public Product? SourceProduct { get; set; }
    public Product? EssentialProduct { get; set; }
}
