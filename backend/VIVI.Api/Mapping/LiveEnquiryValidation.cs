using System.Net.Mail;

namespace VIVI.Api.Mapping;

public static class LiveEnquiryValidation
{
    public static string NormalizeEmail(string? email) => (email ?? string.Empty).Trim().ToLowerInvariant();

    /// <summary>A plain address with an @ and a dot after it; the email provider does the real check.</summary>
    public static bool IsValidEmail(string email)
    {
        if (email.Length is 0 or > 200 || !email.Contains('@'))
            return false;
        try
        {
            var parsed = new MailAddress(email);
            return parsed.Address == email && parsed.Host.Contains('.');
        }
        catch (FormatException)
        {
            return false;
        }
    }
}
