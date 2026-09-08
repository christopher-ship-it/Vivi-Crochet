using VIVI.Core.Entities;

namespace VIVI.Infrastructure.Auth;

public sealed record JwtTokenResult(string AccessToken, DateTime ExpiresAtUtc);

public interface IJwtTokenService
{
    JwtTokenResult CreateAccessToken(AdminUser user);
}
