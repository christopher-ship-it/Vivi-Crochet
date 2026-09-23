using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using VIVI.Infrastructure.Data;

namespace VIVI.Infrastructure.Commerce;

/// <summary>
/// Ensures ProductEssentialLinks exists when AutoMigrate is false or the migration
/// has not been applied yet. Safe to call repeatedly (idempotent).
/// </summary>
public static class ProductEssentialSchemaBootstrapper
{
    public static async Task EnsureAsync(
        ViviDbContext db,
        CancellationToken cancellationToken,
        ILogger? logger = null)
    {
        // Table first — product save must work even if FKs fail to attach.
        await db.Database.ExecuteSqlRawAsync(
            """
            IF OBJECT_ID(N'[ProductEssentialLinks]', N'U') IS NULL
            BEGIN
                CREATE TABLE [ProductEssentialLinks] (
                    [Id] uniqueidentifier NOT NULL,
                    [SourceProductId] uniqueidentifier NOT NULL,
                    [EssentialProductId] uniqueidentifier NOT NULL,
                    [SortOrder] int NOT NULL CONSTRAINT [DF_ProductEssentialLinks_SortOrder] DEFAULT (0),
                    CONSTRAINT [PK_ProductEssentialLinks] PRIMARY KEY ([Id])
                );
            END
            """,
            cancellationToken);

        await TryIndexAsync(
            db,
            """
            IF OBJECT_ID(N'[ProductEssentialLinks]', N'U') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'IX_ProductEssentialLinks_SourceProductId_EssentialProductId'
                      AND object_id = OBJECT_ID(N'[ProductEssentialLinks]'))
                CREATE UNIQUE INDEX [IX_ProductEssentialLinks_SourceProductId_EssentialProductId]
                    ON [ProductEssentialLinks] ([SourceProductId], [EssentialProductId]);
            """,
            "IX_ProductEssentialLinks_SourceProductId_EssentialProductId",
            logger,
            cancellationToken);

        await TryIndexAsync(
            db,
            """
            IF OBJECT_ID(N'[ProductEssentialLinks]', N'U') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'IX_ProductEssentialLinks_SourceProductId_SortOrder'
                      AND object_id = OBJECT_ID(N'[ProductEssentialLinks]'))
                CREATE INDEX [IX_ProductEssentialLinks_SourceProductId_SortOrder]
                    ON [ProductEssentialLinks] ([SourceProductId], [SortOrder]);
            """,
            "IX_ProductEssentialLinks_SourceProductId_SortOrder",
            logger,
            cancellationToken);

        // NO ACTION on both FKs avoids SQL Server "multiple cascade paths" failures.
        await TryIndexAsync(
            db,
            """
            IF OBJECT_ID(N'[ProductEssentialLinks]', N'U') IS NOT NULL
               AND OBJECT_ID(N'[Products]', N'U') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1 FROM sys.foreign_keys
                    WHERE name = N'FK_ProductEssentialLinks_Products_SourceProductId')
                ALTER TABLE [ProductEssentialLinks] WITH CHECK
                ADD CONSTRAINT [FK_ProductEssentialLinks_Products_SourceProductId]
                    FOREIGN KEY ([SourceProductId]) REFERENCES [Products] ([Id]) ON DELETE NO ACTION;
            """,
            "FK_ProductEssentialLinks_Products_SourceProductId",
            logger,
            cancellationToken);

        await TryIndexAsync(
            db,
            """
            IF OBJECT_ID(N'[ProductEssentialLinks]', N'U') IS NOT NULL
               AND OBJECT_ID(N'[Products]', N'U') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1 FROM sys.foreign_keys
                    WHERE name = N'FK_ProductEssentialLinks_Products_EssentialProductId')
                ALTER TABLE [ProductEssentialLinks] WITH CHECK
                ADD CONSTRAINT [FK_ProductEssentialLinks_Products_EssentialProductId]
                    FOREIGN KEY ([EssentialProductId]) REFERENCES [Products] ([Id]) ON DELETE NO ACTION;
            """,
            "FK_ProductEssentialLinks_Products_EssentialProductId",
            logger,
            cancellationToken);
    }

    private static async Task TryIndexAsync(
        ViviDbContext db,
        string sql,
        string name,
        ILogger? logger,
        CancellationToken cancellationToken)
    {
        try
        {
            await db.Database.ExecuteSqlRawAsync(sql, cancellationToken);
        }
        catch (Exception ex)
        {
            logger?.LogWarning(ex, "ProductEssentialLinks schema step skipped: {Step}", name);
        }
    }
}
