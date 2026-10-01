using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

/// <summary>Adds Customers.LanguageCode and CountryCode (first-launch language / country choice). Idempotent.</summary>
[DbContext(typeof(ViviDbContext))]
[Migration("20260930140000_AddCustomerLanguageAndCountry")]
public sealed class AddCustomerLanguageAndCountry : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF COL_LENGTH('Customers', 'LanguageCode') IS NULL
                ALTER TABLE [Customers] ADD [LanguageCode] nvarchar(8) NULL;
            IF COL_LENGTH('Customers', 'CountryCode') IS NULL
                ALTER TABLE [Customers] ADD [CountryCode] nvarchar(2) NULL;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF COL_LENGTH('Customers', 'LanguageCode') IS NOT NULL ALTER TABLE [Customers] DROP COLUMN [LanguageCode];
            IF COL_LENGTH('Customers', 'CountryCode') IS NOT NULL ALTER TABLE [Customers] DROP COLUMN [CountryCode];
            """);
    }
}
