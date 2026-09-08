namespace VIVI.Infrastructure.Configuration;

public sealed class RazorpayOptions
{
    public const string SectionName = "Razorpay";

    public string KeyId { get; set; } = string.Empty;
    public string KeySecret { get; set; } = string.Empty;
    public string WebhookSecret { get; set; } = string.Empty;
    public string BaseUrl { get; set; } = "https://api.razorpay.com/v1";
}
