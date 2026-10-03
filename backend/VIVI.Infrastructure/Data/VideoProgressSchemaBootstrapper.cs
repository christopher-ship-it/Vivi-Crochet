using Microsoft.EntityFrameworkCore;

namespace VIVI.Infrastructure.Data;

/// <summary>Ensures the VideoProgress table exists when AutoMigrate is false.</summary>
public static class VideoProgressSchemaBootstrapper
{
    public static async Task EnsureAsync(ViviDbContext db, CancellationToken cancellationToken)
    {
        // Separate batches: the indexes are created only after the table exists.
        await db.Database.ExecuteSqlRawAsync(VideoProgressSchemaSql.CreateTable, cancellationToken);
        await db.Database.ExecuteSqlRawAsync(VideoProgressSchemaSql.CreateUniqueIndex, cancellationToken);
        await db.Database.ExecuteSqlRawAsync(VideoProgressSchemaSql.CreateCourseIndex, cancellationToken);
        await db.Database.ExecuteSqlRawAsync(VideoProgressSchemaSql.CreateVideoIndex, cancellationToken);
    }
}
