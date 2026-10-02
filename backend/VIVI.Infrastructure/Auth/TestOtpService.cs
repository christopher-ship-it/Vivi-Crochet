using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Data;

namespace VIVI.Infrastructure.Auth;

/// <summary>
/// Wraps the real OTP provider. For the one configured test phone (Seed:TestAccount, when enabled)
/// no SMS is sent and the fixed code <see cref="Code"/> signs in. Every other phone goes to the
/// real provider unchanged, and turning the test account off removes the shortcut entirely.
/// </summary>
public sealed class TestOtpService : IOtpService
{
    /// <summary>Fixed OTP for the test phone.</summary>
    public const string Code = "123456";

    /// <summary>Provider session id handed out for the test phone; never matches a real one.</summary>
    public const string SessionId = "test-account-otp-session";

    private readonly IOtpService _inner;
    private readonly TestAccountSettings _settings;

    public TestOtpService(IOtpService inner, TestAccountSettings settings)
    {
        _inner = inner;
        _settings = settings;
    }

    public Task<string> SendOtpAsync(string phone, CancellationToken cancellationToken = default) =>
        IsTestPhone(phone)
            ? Task.FromResult(SessionId)
            : _inner.SendOtpAsync(phone, cancellationToken);

    public Task<bool> VerifyOtpAsync(string providerSessionId, string code, CancellationToken cancellationToken = default)
    {
        if (!string.Equals(providerSessionId, SessionId, StringComparison.Ordinal))
            return _inner.VerifyOtpAsync(providerSessionId, code, cancellationToken);

        // Checked again here so switching the test account off also kills sessions already handed out.
        return Task.FromResult(
            _settings.Enabled && string.Equals(code?.Trim(), Code, StringComparison.Ordinal));
    }

    private bool IsTestPhone(string phone)
    {
        if (!_settings.Enabled || string.IsNullOrWhiteSpace(_settings.Phone))
            return false;

        try
        {
            return string.Equals(
                CustomerAccountService.NormalizePhone(phone),
                CustomerAccountService.NormalizePhone(_settings.Phone),
                StringComparison.Ordinal);
        }
        catch (ArgumentException)
        {
            return false;
        }
    }
}
