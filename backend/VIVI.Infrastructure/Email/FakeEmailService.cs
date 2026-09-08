using System.Collections.Concurrent;
using VIVI.Core.Interfaces;

namespace VIVI.Infrastructure.Email;

public sealed class FakeEmailService : IEmailService
{
    private readonly ConcurrentQueue<EmailSendRequest> _sent = new();
    private readonly bool _isConfigured;
    private readonly bool _shouldFail;

    public FakeEmailService(bool isConfigured = true, bool shouldFail = false)
    {
        _isConfigured = isConfigured;
        _shouldFail = shouldFail;
    }

    public bool IsConfigured => _isConfigured;

    public IReadOnlyCollection<EmailSendRequest> SentMessages => _sent.ToArray();

    public Task<EmailSendResult> SendAsync(EmailSendRequest request, CancellationToken cancellationToken)
    {
        if (!IsConfigured)
            return Task.FromResult(new EmailSendResult(false, null, "Resend is not configured."));

        if (_shouldFail)
            return Task.FromResult(new EmailSendResult(false, null, "Simulated send failure."));

        _sent.Enqueue(request);
        return Task.FromResult(new EmailSendResult(true, $"fake-{Guid.NewGuid():N}", null));
    }

    public void Clear() => _sent.Clear();
}
