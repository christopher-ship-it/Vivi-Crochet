using Microsoft.EntityFrameworkCore;
using VIVI.Infrastructure.Data;

namespace VIVI.Infrastructure.Commerce;

/// <summary>
/// Ensures Products.ProductCode, ShopSlots and ShopSlotProducts exist when AutoMigrate is false
/// or the migration has not been applied. Safe to call repeatedly (idempotent).
/// The same SQL backs the AddShopSlots migration.
/// </summary>
public static class ShopSlotSchemaBootstrapper
{
    public const string SchemaSql = """
        IF COL_LENGTH('Products', 'ProductCode') IS NULL
            ALTER TABLE [Products] ADD [ProductCode] nvarchar(40) NULL;

        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Products_ProductCode' AND object_id = OBJECT_ID(N'[Products]'))
            EXEC(N'CREATE UNIQUE INDEX [IX_Products_ProductCode] ON [Products] ([ProductCode]) WHERE [ProductCode] IS NOT NULL');

        IF OBJECT_ID(N'[ShopSlots]', N'U') IS NULL
        BEGIN
            CREATE TABLE [ShopSlots] (
                [Id] uniqueidentifier NOT NULL,
                [Name] nvarchar(80) NOT NULL,
                [ProductType] int NOT NULL,
                [DisplayOrder] int NOT NULL,
                [IsActive] bit NOT NULL,
                [CreatedAt] datetime2 NOT NULL,
                [UpdatedAt] datetime2 NOT NULL,
                CONSTRAINT [PK_ShopSlots] PRIMARY KEY ([Id])
            );
            CREATE INDEX [IX_ShopSlots_ProductType_DisplayOrder] ON [ShopSlots] ([ProductType], [DisplayOrder]);
        END

        IF OBJECT_ID(N'[ShopSlotProducts]', N'U') IS NULL
        BEGIN
            CREATE TABLE [ShopSlotProducts] (
                [Id] uniqueidentifier NOT NULL,
                [SlotId] uniqueidentifier NOT NULL,
                [ProductId] uniqueidentifier NOT NULL,
                [DisplayOrder] int NOT NULL,
                [IsActive] bit NOT NULL,
                CONSTRAINT [PK_ShopSlotProducts] PRIMARY KEY ([Id]),
                CONSTRAINT [FK_ShopSlotProducts_ShopSlots_SlotId]
                    FOREIGN KEY ([SlotId]) REFERENCES [ShopSlots] ([Id]) ON DELETE CASCADE,
                CONSTRAINT [FK_ShopSlotProducts_Products_ProductId]
                    FOREIGN KEY ([ProductId]) REFERENCES [Products] ([Id]) ON DELETE NO ACTION
            );
            CREATE UNIQUE INDEX [IX_ShopSlotProducts_SlotId_ProductId] ON [ShopSlotProducts] ([SlotId], [ProductId]);
            CREATE INDEX [IX_ShopSlotProducts_SlotId_DisplayOrder] ON [ShopSlotProducts] ([SlotId], [DisplayOrder]);
            CREATE INDEX [IX_ShopSlotProducts_ProductId] ON [ShopSlotProducts] ([ProductId]);
        END
        """;

    public static async Task EnsureAsync(ViviDbContext db, CancellationToken cancellationToken)
    {
        // In-memory / non-relational providers (unit tests) have no SQL Server DDL.
        if (!db.Database.IsRelational())
            return;

        await db.Database.ExecuteSqlRawAsync(SchemaSql, cancellationToken);
    }
}
