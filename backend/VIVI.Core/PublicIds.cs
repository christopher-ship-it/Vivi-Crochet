using System.Security.Cryptography;

namespace VIVI.Core;

/// <summary>
/// Customer-facing IDs that are easy to read out and hard to guess.
/// <list type="bullet">
/// <item><c>VC-K7M2QX</c> — every customer (random, not sequential).</item>
/// <item><c>VV-KQTD-007</c> — founding members: random letters plus the 3-digit member number.</item>
/// </list>
/// Characters that look alike (0, O, 1, I, L) are never used, so an ID read from a screenshot
/// or over the phone is not misheard.
/// </summary>
public static class PublicIds
{
    public const string CustomerPrefix = "VC-";
    public const string MemberPrefix = "VV-";
    public const int CustomerRandomLength = 6;
    public const int MemberLetterLength = 4;

    private const string Letters = "ABCDEFGHJKMNPQRSTUVWXYZ";
    private const string LettersAndDigits = Letters + "23456789";

    public static string NewCustomerCode() =>
        CustomerPrefix + RandomString(LettersAndDigits, CustomerRandomLength);

    /// <summary>
    /// Founding-member ID, e.g. <c>VV-KQTD-007</c> for member number 7. Three digits for the first
    /// 100 founders; the number simply gets longer if an admin ever raises the limit above 999.
    /// </summary>
    public static string NewMemberCode(int memberNumber)
    {
        if (memberNumber < 1)
            throw new ArgumentOutOfRangeException(nameof(memberNumber), "Member number must be at least 1.");
        return $"{MemberPrefix}{RandomString(Letters, MemberLetterLength)}-{memberNumber:D3}";
    }

    /// <summary>Student founding-member ID, e.g. <c>VS-KQTD-007</c>. Students are numbered separately from the launch members.</summary>
    public static string NewStudentMemberCode(int memberNumber)
    {
        if (memberNumber < 1)
            throw new ArgumentOutOfRangeException(nameof(memberNumber), "Member number must be at least 1.");
        return $"VS-{RandomString(Letters, MemberLetterLength)}-{memberNumber:D3}";
    }

    /// <summary>A fresh student code like <c>VIVISTUDENT4821</c>.</summary>
    public static string NewStudentCode() =>
        $"VIVISTUDENT{RandomNumberGenerator.GetInt32(1000, 10000)}";

    /// <summary>Normalizes a student code: upper-case, no spaces or dashes.</summary>
    public static string NormalizeStudentCode(string? value) =>
        new string((value ?? string.Empty).Where(char.IsLetterOrDigit).ToArray()).ToUpperInvariant();

    /// <summary>Normalizes what a person typed (spaces, lowercase) for lookups.</summary>
    public static string Normalize(string? value) =>
        (value ?? string.Empty).Trim().ToUpperInvariant().Replace(" ", string.Empty);

    private static string RandomString(string alphabet, int length)
    {
        Span<char> chars = stackalloc char[length];
        for (var i = 0; i < length; i++)
            chars[i] = alphabet[RandomNumberGenerator.GetInt32(alphabet.Length)];
        return new string(chars);
    }
}
