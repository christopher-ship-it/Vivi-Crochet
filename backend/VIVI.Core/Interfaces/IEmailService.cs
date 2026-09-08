namespace VIVI.Core.Interfaces;

public sealed record EmailSendRequest(
    string To,
    string Subject,
    string HtmlBody,
    string? TextBody = null);

public sealed record EmailSendResult(
    bool Success,
    string? MessageId,
    string? Error);

public interface IEmailService
{
    bool IsConfigured { get; }

    Task<EmailSendResult> SendAsync(EmailSendRequest request, CancellationToken cancellationToken);
}
