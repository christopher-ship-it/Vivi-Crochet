using Microsoft.EntityFrameworkCore;

namespace VIVI.Infrastructure.Data;

/// <summary>Ensures the IntroVideos table exists when AutoMigrate is false.</summary>
public static class IntroVideoSchemaBootstrapper
{
    public static Task EnsureAsync(ViviDbContext db, CancellationToken cancellationToken)
        => db.Database.ExecuteSqlRawAsync(IntroVideoSchemaSql.CreateTable, cancellationToken);
}
