using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VIVI.Infrastructure.Commerce;
using VIVI.Infrastructure.Data;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

/// <summary>Adds Products.ProductCode and yarn/colour spec columns. Idempotent. (Shop slots were later removed.)</summary>
[DbContext(typeof(ViviDbContext))]
[Migration("20260929120000_AddShopSlots")]
public sealed class AddShopSlots : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(ShopSlotSchemaBootstrapper.ProductColumnsSql);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF OBJECT_ID(N'[ShopSlotProducts]', N'U') IS NOT NULL DROP TABLE [ShopSlotProducts];
            IF OBJECT_ID(N'[ShopSlots]', N'U') IS NOT NULL DROP TABLE [ShopSlots];
            IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Products_ProductCode' AND object_id = OBJECT_ID(N'[Products]'))
                DROP INDEX [IX_Products_ProductCode] ON [Products];
            IF COL_LENGTH('Products', 'ProductCode') IS NOT NULL
                ALTER TABLE [Products] DROP COLUMN [ProductCode];
            """);
    }
}
