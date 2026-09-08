using VIVI.Core.Interfaces;

namespace VIVI.Infrastructure.Auth;

/// <summary>Test OTP service — session id is fixed; code 123456 always verifies.</summary>
public sealed class FakeOtpService : IOtpService
{
    public const string TestSessionId = "test-otp-session";
    public const string TestCode = "123456";

    public Task<string> SendOtpAsync(string phone, CancellationToken cancellationToken = default)
        => Task.FromResult(TestSessionId);

    public Task<bool> VerifyOtpAsync(string providerSessionId, string code, CancellationToken cancellationToken = default)
        => Task.FromResult(
            string.Equals(providerSessionId, TestSessionId, StringComparison.Ordinal)
            && string.Equals(code.Trim(), TestCode, StringComparison.Ordinal));
}
