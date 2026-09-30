using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VIVI.Infrastructure.Commerce;
using VIVI.Infrastructure.Data;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

/// <summary>Adds Products.ParentProductId and VariantOptionName for parent listing + variant SKUs.</summary>
[DbContext(typeof(ViviDbContext))]
[Migration("20260930120000_AddProductVariants")]
public sealed class AddProductVariants : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Reuse bootstrapper SQL (idempotent; also ensures older product columns exist).
        migrationBuilder.Sql(ShopSlotSchemaBootstrapper.ProductColumnsSql);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Products_Products_ParentProductId')
                ALTER TABLE [Products] DROP CONSTRAINT [FK_Products_Products_ParentProductId];
            IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Products_ParentProductId' AND object_id = OBJECT_ID(N'[Products]'))
                DROP INDEX [IX_Products_ParentProductId] ON [Products];
            IF COL_LENGTH('Products', 'VariantOptionName') IS NOT NULL
                ALTER TABLE [Products] DROP COLUMN [VariantOptionName];
            IF COL_LENGTH('Products', 'ParentProductId') IS NOT NULL
                ALTER TABLE [Products] DROP COLUMN [ParentProductId];
            """);
    }
}
