using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Resend;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Configuration;

namespace VIVI.Infrastructure.Email;

public sealed class ResendEmailService : IEmailService
{
    private readonly IResend _resend;
    private readonly ResendOptions _options;
    private readonly ILogger<ResendEmailService> _logger;

    public ResendEmailService(
        IResend resend,
        IOptions<ResendOptions> options,
        ILogger<ResendEmailService> logger)
    {
        _resend = resend;
        _options = options.Value;
        _logger = logger;
    }

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(_options.ApiKey)
        && !string.IsNullOrWhiteSpace(_options.FromEmail);

    public async Task<EmailSendResult> SendAsync(EmailSendRequest request, CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            _logger.LogWarning("Resend email skipped: configuration is incomplete.");
            return new EmailSendResult(false, null, "Resend is not configured.");
        }

        var message = new EmailMessage
        {
            From = $"{_options.FromName} <{_options.FromEmail}>",
            Subject = request.Subject,
            HtmlBody = request.HtmlBody,
            TextBody = request.TextBody
        };
        message.To.Add(request.To);

        try
        {
            var response = await _resend.EmailSendAsync(message);
            if (response.Success)
            {
                var messageId = response.Content.ToString();
                _logger.LogInformation(
                    "Resend email sent to {Recipient} subject {Subject} messageId {MessageId}",
                    request.To,
                    request.Subject,
                    messageId);
                return new EmailSendResult(true, messageId, null);
            }

            var error = response.Exception?.Message ?? "Resend send failed.";
            _logger.LogWarning(
                "Resend email failed for {Recipient} subject {Subject}: {Error}",
                request.To,
                request.Subject,
                error);
            return new EmailSendResult(false, null, error);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(
                ex,
                "Resend email exception for {Recipient} subject {Subject}",
                request.To,
                request.Subject);
            return new EmailSendResult(false, null, ex.Message);
        }
    }
}
