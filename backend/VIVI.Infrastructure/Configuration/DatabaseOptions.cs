namespace VIVI.Infrastructure.Configuration;

public sealed class DatabaseOptions
{
    public const string SectionName = "Database";

    /// <summary>
    /// When true, pending EF migrations are applied on application startup.
    /// Default false in Production — prefer running <c>dotnet ef database update</c> during deployment.
    /// </summary>
    public bool AutoMigrate { get; set; }

    /// <summary>
    /// When true, runs the database seeder (admin + categories) when tables are empty.
    /// </summary>
    public bool AutoSeed { get; set; } = true;
}
