using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Configuration;

namespace VIVI.Infrastructure.Commerce;

public sealed class RazorpaySignatureVerifier : IRazorpaySignatureVerifier
{
    private readonly RazorpayOptions _options;

    public RazorpaySignatureVerifier(IOptions<RazorpayOptions> options) => _options = options.Value;

    public bool VerifyPaymentSignature(string razorpayOrderId, string razorpayPaymentId, string razorpaySignature)
    {
        if (string.IsNullOrWhiteSpace(_options.KeySecret))
            return false;

        var payload = $"{razorpayOrderId}|{razorpayPaymentId}";
        var expected = ComputeHmacHex(payload, _options.KeySecret);
        return FixedTimeEquals(expected, razorpaySignature);
    }

    public bool VerifyWebhookSignature(string payload, string signature)
    {
        if (string.IsNullOrWhiteSpace(_options.WebhookSecret))
            return false;

        var expected = ComputeHmacHex(payload, _options.WebhookSecret);
        return FixedTimeEquals(expected, signature);
    }

    private static string ComputeHmacHex(string payload, string secret)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(payload));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private static bool FixedTimeEquals(string left, string right)
    {
        if (string.IsNullOrWhiteSpace(left) || string.IsNullOrWhiteSpace(right))
            return false;

        var leftBytes = Encoding.UTF8.GetBytes(left.Trim().ToLowerInvariant());
        var rightBytes = Encoding.UTF8.GetBytes(right.Trim().ToLowerInvariant());
        return leftBytes.Length == rightBytes.Length && CryptographicOperations.FixedTimeEquals(leftBytes, rightBytes);
    }
}
