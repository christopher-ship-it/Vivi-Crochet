using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

/// <summary>Adds Products.BallWeight, YarnLength and CrochetHookSize, ColourName and ColourHex (Crochet Essentials specs and colour option). Idempotent.</summary>
[DbContext(typeof(ViviDbContext))]
[Migration("20260930100000_AddProductEssentialSpecs")]
public sealed class AddProductEssentialSpecs : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
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
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF COL_LENGTH('Products', 'BallWeight') IS NOT NULL ALTER TABLE [Products] DROP COLUMN [BallWeight];
            IF COL_LENGTH('Products', 'YarnLength') IS NOT NULL ALTER TABLE [Products] DROP COLUMN [YarnLength];
            IF COL_LENGTH('Products', 'CrochetHookSize') IS NOT NULL ALTER TABLE [Products] DROP COLUMN [CrochetHookSize];
            IF COL_LENGTH('Products', 'ColourName') IS NOT NULL ALTER TABLE [Products] DROP COLUMN [ColourName];
            IF COL_LENGTH('Products', 'ColourHex') IS NOT NULL ALTER TABLE [Products] DROP COLUMN [ColourHex];
            """);
    }
}
