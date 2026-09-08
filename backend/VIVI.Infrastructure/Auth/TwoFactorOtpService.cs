using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using VIVI.Core.Interfaces;
using VIVI.Core.Exceptions;
using VIVI.Infrastructure.Configuration;

namespace VIVI.Infrastructure.Auth;

public sealed class TwoFactorOtpService : IOtpService
{
    private readonly HttpClient _http;
    private readonly TwoFactorOptions _options;
    private readonly ILogger<TwoFactorOtpService> _logger;

    public TwoFactorOtpService(
        HttpClient http,
        IOptions<TwoFactorOptions> options,
        ILogger<TwoFactorOtpService> logger)
    {
        _http = http;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<string> SendOtpAsync(string phone, CancellationToken cancellationToken = default)
    {
        EnsureConfigured();

        var url = BuildSendUrl(phone);
        TwoFactorResponse? response;
        try
        {
            response = await _http.GetFromJsonAsync<TwoFactorResponse>(url, cancellationToken);
        }
        catch (Exception ex) when (ex is not ViviException)
        {
            _logger.LogWarning(ex, "2Factor send OTP request failed for phone ending {Suffix}", phone[^4..]);
            throw new ViviException("OTP_SEND_FAILED", "Could not send OTP. Try again in a moment.");
        }

        if (response is null || !response.IsSuccess || string.IsNullOrWhiteSpace(response.Details))
        {
            _logger.LogWarning(
                "2Factor send OTP failed for phone ending {Suffix}. Status={Status} Details={Details}",
                phone[^4..],
                response?.Status,
                response?.Details);
            throw new ViviException("OTP_SEND_FAILED", "Could not send OTP. Try again in a moment.");
        }

        return response.Details.Trim();
    }

    public async Task<bool> VerifyOtpAsync(string providerSessionId, string code, CancellationToken cancellationToken = default)
    {
        EnsureConfigured();

        var url = $"{_options.BaseUrl.TrimEnd('/')}/{_options.ApiKey}/SMS/VERIFY/{providerSessionId}/{code.Trim()}";
        try
        {
            var response = await _http.GetFromJsonAsync<TwoFactorResponse>(url, cancellationToken);
            return response?.IsSuccess == true;
        }
        catch (Exception ex) when (ex is HttpRequestException or System.Text.Json.JsonException or NotSupportedException)
        {
            _logger.LogWarning(ex, "2Factor verify OTP request failed for session {Session}", providerSessionId);
            return false;
        }
    }

    private void EnsureConfigured()
    {
        if (!_options.Enabled)
            throw new ViviException("OTP_DISABLED", "Phone OTP is not configured.");

        if (string.IsNullOrWhiteSpace(_options.ApiKey))
            throw new ViviException("OTP_NOT_CONFIGURED", "Phone OTP is not configured.");
    }

    private string BuildSendUrl(string phone)
    {
        var baseUrl = _options.BaseUrl.TrimEnd('/');
        var template = _options.Template.Trim();
        if (string.IsNullOrEmpty(template))
            return $"{baseUrl}/{_options.ApiKey}/SMS/91{phone}/AUTOGEN";

        return $"{baseUrl}/{_options.ApiKey}/SMS/91{phone}/AUTOGEN/{template}";
    }

    private sealed class TwoFactorResponse
    {
        [JsonPropertyName("Status")]
        public string? Status { get; set; }

        [JsonPropertyName("Details")]
        public string? Details { get; set; }

        public bool IsSuccess => string.Equals(Status, "Success", StringComparison.OrdinalIgnoreCase);
    }
}
