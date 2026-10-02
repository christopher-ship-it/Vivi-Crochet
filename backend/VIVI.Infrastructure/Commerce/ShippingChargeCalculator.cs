using VIVI.Core.Enums;

namespace VIVI.Infrastructure.Commerce;

/// <summary>Flat delivery charges for Crochet Essentials, in rupees. Configured under <c>Shipping</c>.</summary>
public sealed class ShippingChargeSettings
{
    public const int DefaultTamilNaduInr = 79;
    public const int DefaultOtherStatesInr = 100;

    /// <summary>Charge when the delivery address is in Tamil Nadu.</summary>
    public int TamilNaduInr { get; set; } = DefaultTamilNaduInr;

    /// <summary>Charge for every other Indian state.</summary>
    public int OtherStatesInr { get; set; } = DefaultOtherStatesInr;
}

/// <summary>
/// Works out the delivery charge for an order. One flat charge per order (not per item) applies when
/// the order is in rupees and contains at least one Crochet Essentials (Resell) product; Handmade-only
/// orders, course-only orders and international orders are not charged.
/// </summary>
public sealed class ShippingChargeCalculator
{
    private readonly ShippingChargeSettings _settings;

    public ShippingChargeCalculator(ShippingChargeSettings settings) => _settings = settings;

    public decimal ForOrder(string currency, IEnumerable<ProductType> productTypes, string? state)
    {
        if (!string.Equals(currency, "INR", StringComparison.OrdinalIgnoreCase))
            return 0;
        if (!productTypes.Contains(ProductType.Resell))
            return 0;

        return IsTamilNadu(state) ? _settings.TamilNaduInr : _settings.OtherStatesInr;
    }

    /// <summary>Matches "Tamil Nadu", "Tamilnadu", "TAMIL NADU" and "TN" regardless of spacing or case.</summary>
    public static bool IsTamilNadu(string? state)
    {
        if (string.IsNullOrWhiteSpace(state))
            return false;

        var letters = new string(state.Where(char.IsLetter).ToArray()).ToLowerInvariant();
        return letters is "tamilnadu" or "tn";
    }
}
