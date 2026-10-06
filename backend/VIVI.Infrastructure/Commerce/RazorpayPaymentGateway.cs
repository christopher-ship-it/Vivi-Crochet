using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Configuration;

namespace VIVI.Infrastructure.Commerce;

public sealed class RazorpayPaymentGateway : IRazorpayPaymentGateway
{
    private readonly HttpClient _http;
    private readonly RazorpayOptions _options;
    private readonly ILogger<RazorpayPaymentGateway> _logger;

    public RazorpayPaymentGateway(
        HttpClient http,
        IOptions<RazorpayOptions> options,
        ILogger<RazorpayPaymentGateway> logger)
    {
        _http = http;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<RazorpayOrderResult> CreateOrderAsync(
        string receipt,
        int amountPaise,
        string currency,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_options.KeyId) || string.IsNullOrWhiteSpace(_options.KeySecret))
            throw new InvalidOperationException("Razorpay credentials are not configured.");

        var payload = new
        {
            amount = amountPaise,
            currency,
            receipt,
            payment_capture = 1
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, $"{_options.BaseUrl.TrimEnd('/')}/orders");
        request.Headers.Authorization = CreateBasicAuthHeader();
        request.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

        using var response = await _http.SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            _logger.LogError("Razorpay order creation failed: {Status} {Body}", response.StatusCode, body);
            throw new InvalidOperationException("Unable to create Razorpay order.");
        }

        using var doc = JsonDocument.Parse(body);
        var root = doc.RootElement;
        return new RazorpayOrderResult(
            root.GetProperty("id").GetString()!,
            root.GetProperty("amount").GetInt32(),
            root.GetProperty("currency").GetString()!);
    }

    public async Task<RazorpayPaymentDetails?> FetchPaymentAsync(
        string razorpayPaymentId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_options.KeyId) || string.IsNullOrWhiteSpace(_options.KeySecret))
            return null;

        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"{_options.BaseUrl.TrimEnd('/')}/payments/{razorpayPaymentId}");
        request.Headers.Authorization = CreateBasicAuthHeader();

        using var response = await _http.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
            return null;

        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        using var doc = JsonDocument.Parse(body);
        var root = doc.RootElement;
        return new RazorpayPaymentDetails(
            root.GetProperty("order_id").GetString()!,
            root.GetProperty("id").GetString()!,
            root.GetProperty("amount").GetInt32(),
            root.GetProperty("currency").GetString()!,
            root.GetProperty("status").GetString() ?? "created");
    }

    public async Task<RazorpayRefundResult> RefundPaymentAsync(
        string razorpayPaymentId,
        int amountPaise,
        string receipt,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_options.KeyId) || string.IsNullOrWhiteSpace(_options.KeySecret))
            throw new InvalidOperationException("Razorpay credentials are not configured.");

        var payload = new { amount = amountPaise, speed = "normal", receipt };

        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            $"{_options.BaseUrl.TrimEnd('/')}/payments/{razorpayPaymentId}/refund");
        request.Headers.Authorization = CreateBasicAuthHeader();
        request.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

        using var response = await _http.SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            if (body.Contains("fully refunded", StringComparison.OrdinalIgnoreCase))
                return new RazorpayRefundResult(string.Empty, "already_refunded");

            _logger.LogError("Razorpay refund failed for {PaymentId}: {Status} {Body}", razorpayPaymentId, response.StatusCode, body);
            var reason = "Razorpay rejected the refund.";
            try
            {
                using var err = JsonDocument.Parse(body);
                if (err.RootElement.TryGetProperty("error", out var e) && e.TryGetProperty("description", out var d))
                    reason = d.GetString() ?? reason;
            }
            catch (JsonException)
            {
            }
            throw new VIVI.Core.Exceptions.ViviException("REFUND_FAILED", reason, 409);
        }

        using var doc = JsonDocument.Parse(body);
        var root = doc.RootElement;
        return new RazorpayRefundResult(
            root.GetProperty("id").GetString()!,
            root.TryGetProperty("status", out var st) ? st.GetString() ?? "processed" : "processed");
    }

    private AuthenticationHeaderValue CreateBasicAuthHeader()
    {
        var token = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{_options.KeyId}:{_options.KeySecret}"));
        return new AuthenticationHeaderValue("Basic", token);
    }
}
