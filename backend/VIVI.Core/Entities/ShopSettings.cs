namespace VIVI.Core.Entities;

/// <summary>Shop switches set from the admin dashboard. There is only ever one row.</summary>
public sealed class ShopSettings
{
    public Guid Id { get; set; }
    /// <summary>When false the Handmade Collection is hidden from the app and its products are not listed.</summary>
    public bool HandmadeEnabled { get; set; } = true;
    public DateTime UpdatedAt { get; set; }
}
