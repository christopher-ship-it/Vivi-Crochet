using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VIVI.Infrastructure.Commerce;
using VIVI.Infrastructure.Data;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

/// <summary>Adds Products.FibreBlend, YarnWeight and NeedleSize (Crochet Essentials yarn specs). Idempotent.</summary>
[DbContext(typeof(ViviDbContext))]
[Migration("20261001200000_AddProductYarnSpecs")]
public sealed class AddProductYarnSpecs : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(ShopSlotSchemaBootstrapper.YarnSpecColumnsSql);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF COL_LENGTH('Products', 'FibreBlend') IS NOT NULL ALTER TABLE [Products] DROP COLUMN [FibreBlend];
            IF COL_LENGTH('Products', 'YarnWeight') IS NOT NULL ALTER TABLE [Products] DROP COLUMN [YarnWeight];
            IF COL_LENGTH('Products', 'NeedleSize') IS NOT NULL ALTER TABLE [Products] DROP COLUMN [NeedleSize];
            """);
    }
}
