using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using VIVI.Infrastructure.Configuration;
using VIVI.Infrastructure.Data;

namespace VIVI.Infrastructure.Push;

public sealed record ExpoPushMessage(
    string To,
    string Title,
    string Body,
    IReadOnlyDictionary<string, string> Data,
    string? Sound = "default");

/// <summary>Sends notifications via the Expo Push API.</summary>
public sealed class ExpoPushService
{
    private static readonly Uri ExpoPushUri = new("https://exp.host/--/api/v2/push/send");
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly HttpClient _http;
    private readonly ViviDbContext _db;
    private readonly PushOptions _options;
    private readonly ILogger<ExpoPushService> _logger;

    public ExpoPushService(
        HttpClient http,
        ViviDbContext db,
        IOptions<PushOptions> options,
        ILogger<ExpoPushService> logger)
    {
        _http = http;
        _db = db;
        _options = options.Value;
        _logger = logger;
    }

    public async Task SendAsync(IReadOnlyList<ExpoPushMessage> messages, CancellationToken cancellationToken)
    {
        if (messages.Count == 0)
            return;

        if (!_options.Enabled)
        {
            _logger.LogInformation("Push disabled; skipping {Count} message(s).", messages.Count);
            return;
        }

        for (var offset = 0; offset < messages.Count; offset += 100)
        {
            var batch = messages.Skip(offset).Take(100).Select(m => new
            {
                to = m.To,
                title = m.Title,
                body = m.Body,
                data = m.Data,
                sound = m.Sound,
                priority = "high"
            }).ToList();

            using var response = await _http.PostAsJsonAsync(ExpoPushUri, batch, JsonOptions, cancellationToken);
            var payload = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Expo push HTTP {Status}: {Body}", (int)response.StatusCode, payload);
                continue;
            }

            await DisableInvalidTokensAsync(payload, cancellationToken);
        }
    }

    private async Task DisableInvalidTokensAsync(string payload, CancellationToken cancellationToken)
    {
        try
        {
            using var doc = JsonDocument.Parse(payload);
            if (!doc.RootElement.TryGetProperty("data", out var data))
                return;

            var badTokens = new List<string>();
            foreach (var ticket in data.EnumerateArray())
            {
                if (!ticket.TryGetProperty("status", out var status))
                    continue;
                if (!string.Equals(status.GetString(), "error", StringComparison.OrdinalIgnoreCase))
                    continue;

                var details = ticket.TryGetProperty("details", out var d) ? d : default;
                var error = details.ValueKind == JsonValueKind.Object
                    && details.TryGetProperty("error", out var err)
                        ? err.GetString()
                        : null;

                if (!string.Equals(error, "DeviceNotRegistered", StringComparison.OrdinalIgnoreCase))
                    continue;

                // Expo may echo the token in message field; look up from our send set via "message"
                if (ticket.TryGetProperty("message", out var messageEl))
                {
                    var msg = messageEl.GetString() ?? "";
                    // Not always the token; we scan active tokens that appear in the message.
                    var match = await _db.DevicePushTokens
                        .Where(t => t.IsActive && msg.Contains(t.ExpoPushToken))
                        .Select(t => t.ExpoPushToken)
                        .FirstOrDefaultAsync(cancellationToken);
                    if (!string.IsNullOrEmpty(match))
                        badTokens.Add(match);
                }
            }

            if (badTokens.Count == 0)
                return;

            var now = DateTime.UtcNow;
            var tokens = await _db.DevicePushTokens
                .Where(t => badTokens.Contains(t.ExpoPushToken) && t.IsActive)
                .ToListAsync(cancellationToken);
            foreach (var token in tokens)
            {
                token.IsActive = false;
                token.UpdatedAt = now;
            }

            if (tokens.Count > 0)
                await _db.SaveChangesAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Could not parse Expo push tickets for token cleanup.");
        }
    }
}
