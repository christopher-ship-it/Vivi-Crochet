using Microsoft.EntityFrameworkCore;

namespace VIVI.Infrastructure.Data;

/// <summary>Ensures the student-code schema exists when AutoMigrate is false.</summary>
public static class StudentOfferSchemaBootstrapper
{
    public static async Task EnsureAsync(ViviDbContext db, CancellationToken cancellationToken)
    {
        foreach (var statement in StudentOfferSchemaSql.Up)
            await db.Database.ExecuteSqlRawAsync(statement, cancellationToken);
    }
}
