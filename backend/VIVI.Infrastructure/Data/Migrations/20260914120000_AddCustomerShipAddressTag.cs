using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VIVI.Infrastructure.Data;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

[DbContext(typeof(ViviDbContext))]
[Migration("20260914120000_AddCustomerShipAddressTag")]
public sealed class AddCustomerShipAddressTag : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF COL_LENGTH('dbo.Customers', 'ShipAddressTag') IS NULL
                ALTER TABLE [Customers] ADD [ShipAddressTag] nvarchar(40) NULL;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF COL_LENGTH('dbo.Customers', 'ShipAddressTag') IS NOT NULL
                ALTER TABLE [Customers] DROP COLUMN [ShipAddressTag];
            """);
    }
}
