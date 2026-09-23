using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VIVI.Infrastructure.Data;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

/// <summary>
/// International shipping needs wider columns than the original India-only sizes
/// (ShipPhone nvarchar(10), ShipPinCode nvarchar(6)). Truncation caused DbUpdateException
/// → HTTP 409 SAVE_FAILED ("Could not save this change…") for non-India addresses.
/// </summary>
[DbContext(typeof(ViviDbContext))]
[Migration("20260922180000_WidenShipPhoneAndPostal")]
public sealed class WidenShipPhoneAndPostal : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            -- Customers.ShipPhone: 10 → 20 (E.164 digits, country code + national)
            IF EXISTS (
                SELECT 1 FROM sys.columns
                WHERE object_id = OBJECT_ID(N'dbo.Customers')
                  AND name = N'ShipPhone'
                  AND max_length > 0 AND max_length < 40)
                ALTER TABLE [Customers] ALTER COLUMN [ShipPhone] nvarchar(20) NULL;

            -- Customers.ShipPinCode: 6 → 12 (alphanumeric postal / ZIP)
            IF EXISTS (
                SELECT 1 FROM sys.columns
                WHERE object_id = OBJECT_ID(N'dbo.Customers')
                  AND name = N'ShipPinCode'
                  AND max_length > 0 AND max_length < 24)
                ALTER TABLE [Customers] ALTER COLUMN [ShipPinCode] nvarchar(12) NULL;

            -- Orders.ShipPhone
            IF EXISTS (
                SELECT 1 FROM sys.columns
                WHERE object_id = OBJECT_ID(N'dbo.Orders')
                  AND name = N'ShipPhone'
                  AND max_length > 0 AND max_length < 40)
                ALTER TABLE [Orders] ALTER COLUMN [ShipPhone] nvarchar(20) NULL;

            -- Orders.ShipPinCode
            IF EXISTS (
                SELECT 1 FROM sys.columns
                WHERE object_id = OBJECT_ID(N'dbo.Orders')
                  AND name = N'ShipPinCode'
                  AND max_length > 0 AND max_length < 24)
                ALTER TABLE [Orders] ALTER COLUMN [ShipPinCode] nvarchar(12) NULL;

            -- Orders.ShipCountry: 40 → 80 (match Customers / long country names)
            IF EXISTS (
                SELECT 1 FROM sys.columns
                WHERE object_id = OBJECT_ID(N'dbo.Orders')
                  AND name = N'ShipCountry'
                  AND max_length > 0 AND max_length < 160)
                ALTER TABLE [Orders] ALTER COLUMN [ShipCountry] nvarchar(80) NULL;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Intentionally left blank — narrowing would truncate international numbers.
    }
}
