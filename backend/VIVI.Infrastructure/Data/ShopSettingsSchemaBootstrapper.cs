using Microsoft.EntityFrameworkCore;

namespace VIVI.Infrastructure.Data;

/// <summary>Ensures the ShopSettings table exists when AutoMigrate is false.</summary>
public static class ShopSettingsSchemaBootstrapper
{
    public static async Task EnsureAsync(ViviDbContext db, CancellationToken cancellationToken)
    {
        await db.Database.ExecuteSqlRawAsync(ShopSettingsSchemaSql.CreateTable, cancellationToken);
        await db.Database.ExecuteSqlRawAsync(ShopSettingsSchemaSql.AddDeliveryNotice, cancellationToken);
    }
}
