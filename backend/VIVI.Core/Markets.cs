using VIVI.Core.Enums;

namespace VIVI.Core;

/// <summary>What a customer in one country can do and which currency they pay in.</summary>
public sealed record Market(
    string CountryCode,
    string Currency,
    bool CanOrderProducts,
    bool CanBookLiveClasses)
{
    /// <summary>India uses the prices stored on the course itself; other markets use per-country prices.</summary>
    public bool UsesBasePrices => CountryCode == Markets.DefaultCountry;
}

/// <summary>
/// The markets VIVI sells in. Outside India only courses (and the founding membership) can be
/// bought: no physical products and no live class bookings.
/// </summary>
public static class Markets
{
    public const string DefaultCountry = "IN";

    public static readonly Market India = new("IN", "INR", CanOrderProducts: true, CanBookLiveClasses: true);
    public static readonly Market UnitedStates = new("US", "USD", CanOrderProducts: false, CanBookLiveClasses: false);

    /// <summary>The market for a country code. Missing or unknown codes fall back to India (legacy accounts).</summary>
    public static Market For(string? countryCode)
        => string.Equals(countryCode?.Trim(), "US", StringComparison.OrdinalIgnoreCase) ? UnitedStates : India;

    /// <summary>
    /// The country a customer is priced in. International (email) accounts are always US: only an Indian mobile
    /// number signs up through the India route, so they cannot pick India prices. Everyone else uses the country they chose.
    /// </summary>
    public static string? EffectiveCountry(CustomerAuthMethod authMethod, string? savedCountry)
        => authMethod == CustomerAuthMethod.EmailPassword ? "US" : savedCountry;

    public static Market ForCurrency(string? currency)
        => string.Equals(currency?.Trim(), "USD", StringComparison.OrdinalIgnoreCase) ? UnitedStates : India;

    /// <summary>Countries that have their own course prices (everything except the base market, India).</summary>
    public static readonly IReadOnlySet<string> PricedCountries = new HashSet<string>(StringComparer.Ordinal) { "US" };
}
