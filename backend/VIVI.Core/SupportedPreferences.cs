using VIVI.Core.Exceptions;

namespace VIVI.Core;

/// <summary>
/// Language and country a customer picks on first launch. Stored as short codes, never as free text.
/// More countries can be added here later.
/// </summary>
public static class SupportedPreferences
{
    public static readonly IReadOnlySet<string> LanguageCodes =
        new HashSet<string>(StringComparer.Ordinal) { "en", "ta", "hi" };

    public static readonly IReadOnlySet<string> CountryCodes =
        new HashSet<string>(StringComparer.Ordinal) { "IN", "US" };

    /// <summary>Returns the lower-case language code, or throws if it is not supported. Null stays null.</summary>
    public static string? NormalizeLanguage(string? value)
    {
        if (value is null)
            return null;

        var code = value.Trim().ToLowerInvariant();
        if (!LanguageCodes.Contains(code))
            throw new ViviException("INVALID_LANGUAGE", "Language must be one of: en, ta, hi.");
        return code;
    }

    /// <summary>Returns the upper-case country code, or throws if it is not supported. Null stays null.</summary>
    public static string? NormalizeCountry(string? value)
    {
        if (value is null)
            return null;

        var code = value.Trim().ToUpperInvariant();
        if (!CountryCodes.Contains(code))
            throw new ViviException("INVALID_COUNTRY", "Country must be one of: IN, US.");
        return code;
    }
}
