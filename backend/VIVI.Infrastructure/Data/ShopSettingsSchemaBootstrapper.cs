using Microsoft.EntityFrameworkCore;

namespace VIVI.Infrastructure.Data;

/// <summary>Ensures the ShopSettings table exists when AutoMigrate is false.</summary>
public static class ShopSettingsSchemaBootstrapper
{
    public static Task EnsureAsync(ViviDbContext db, CancellationToken cancellationToken)
        => db.Database.ExecuteSqlRawAsync(ShopSettingsSchemaSql.CreateTable, cancellationToken);
}
