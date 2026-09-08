namespace VIVI.Core.Entities;

public sealed class ProductImage
{
    public Guid Id { get; set; }
    public Guid ProductId { get; set; }
    public string BlobPath { get; set; } = string.Empty;
    public int SortOrder { get; set; }
    public bool IsMain { get; set; }
    public DateTime CreatedAt { get; set; }

    public Product Product { get; set; } = null!;
}
