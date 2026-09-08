namespace VIVI.Core.Interfaces;

public interface IOtpService
{
    Task<string> SendOtpAsync(string phone, CancellationToken cancellationToken = default);

    Task<bool> VerifyOtpAsync(string providerSessionId, string code, CancellationToken cancellationToken = default);
}
