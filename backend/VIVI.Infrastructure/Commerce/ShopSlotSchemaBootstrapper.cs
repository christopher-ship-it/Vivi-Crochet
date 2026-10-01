using Microsoft.EntityFrameworkCore;
using VIVI.Infrastructure.Data;

namespace VIVI.Infrastructure.Commerce;

/// <summary>
/// Ensures product catalog columns (ProductCode, yarn/colour specs) exist when AutoMigrate is false
/// or the migration has not been applied. Also drops legacy ShopSlots tables if present.
/// Safe to call repeatedly (idempotent).
/// </summary>
public static class ShopSlotSchemaBootstrapper
{
    /// <summary>Product columns only — used by the historical AddShopSlots migration.</summary>
    public const string ProductColumnsSql = """
        IF COL_LENGTH('Products', 'ProductCode') IS NULL
            ALTER TABLE [Products] ADD [ProductCode] nvarchar(40) NULL;

        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Products_ProductCode' AND object_id = OBJECT_ID(N'[Products]'))
            EXEC(N'CREATE UNIQUE INDEX [IX_Products_ProductCode] ON [Products] ([ProductCode]) WHERE [ProductCode] IS NOT NULL');

        IF COL_LENGTH('Products', 'BallWeight') IS NULL
            ALTER TABLE [Products] ADD [BallWeight] nvarchar(40) NULL;

        IF COL_LENGTH('Products', 'YarnLength') IS NULL
            ALTER TABLE [Products] ADD [YarnLength] nvarchar(40) NULL;

        IF COL_LENGTH('Products', 'CrochetHookSize') IS NULL
            ALTER TABLE [Products] ADD [CrochetHookSize] nvarchar(40) NULL;

        IF COL_LENGTH('Products', 'ColourName') IS NULL
            ALTER TABLE [Products] ADD [ColourName] nvarchar(40) NULL;

        IF COL_LENGTH('Products', 'ColourHex') IS NULL
            ALTER TABLE [Products] ADD [ColourHex] nvarchar(7) NULL;

        IF COL_LENGTH('Products', 'ParentProductId') IS NULL
            ALTER TABLE [Products] ADD [ParentProductId] uniqueidentifier NULL;

        IF COL_LENGTH('Products', 'VariantOptionName') IS NULL
            ALTER TABLE [Products] ADD [VariantOptionName] nvarchar(40) NULL;

        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Products_ParentProductId' AND object_id = OBJECT_ID(N'[Products]'))
            EXEC(N'CREATE INDEX [IX_Products_ParentProductId] ON [Products] ([ParentProductId])');

        IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Products_Products_ParentProductId')
            EXEC(N'ALTER TABLE [Products] ADD CONSTRAINT [FK_Products_Products_ParentProductId]
                FOREIGN KEY ([ParentProductId]) REFERENCES [Products] ([Id])');
        """;

    /// <summary>Fibre / yarn weight / needle size specs for Crochet Essentials yarns (AddProductYarnSpecs migration).</summary>
    public const string YarnSpecColumnsSql = """
        IF COL_LENGTH('Products', 'FibreBlend') IS NULL
            ALTER TABLE [Products] ADD [FibreBlend] nvarchar(80) NULL;

        IF COL_LENGTH('Products', 'YarnWeight') IS NULL
            ALTER TABLE [Products] ADD [YarnWeight] nvarchar(40) NULL;

        IF COL_LENGTH('Products', 'NeedleSize') IS NULL
            ALTER TABLE [Products] ADD [NeedleSize] nvarchar(40) NULL;
        """;

    public const string DropLegacySlotsSql = """
        IF OBJECT_ID(N'[ShopSlotProducts]', N'U') IS NOT NULL DROP TABLE [ShopSlotProducts];
        IF OBJECT_ID(N'[ShopSlots]', N'U') IS NOT NULL DROP TABLE [ShopSlots];
        """;

    /// <summary>Full bootstrap: product columns + drop legacy slot tables.</summary>
    public const string SchemaSql = ProductColumnsSql + "\n" + YarnSpecColumnsSql + "\n" + DropLegacySlotsSql;

    public static async Task EnsureAsync(ViviDbContext db, CancellationToken cancellationToken)
    {
        // In-memory / non-relational providers (unit tests) have no SQL Server DDL.
        if (!db.Database.IsRelational())
            return;

        await db.Database.ExecuteSqlRawAsync(SchemaSql, cancellationToken);
    }
}
