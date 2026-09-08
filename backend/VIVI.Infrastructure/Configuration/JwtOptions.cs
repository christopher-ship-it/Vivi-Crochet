namespace VIVI.Infrastructure.Configuration;

public sealed class JwtOptions
{
    public const string SectionName = "Jwt";

    public string SigningKey { get; set; } = string.Empty;
    public string Issuer { get; set; } = "vivi-api";
    public string Audience { get; set; } = "vivi-clients";
    public int AccessTokenMinutes { get; set; } = 480;
    public int CustomerAccessTokenMinutes { get; set; } = 43200;
}
