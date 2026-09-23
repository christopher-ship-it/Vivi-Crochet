using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VIVI.Infrastructure.Data;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

[DbContext(typeof(ViviDbContext))]
[Migration("20260916140000_WidenCustomerPhoneNumber")]
public sealed class WidenCustomerPhoneNumber : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF EXISTS (
                SELECT 1 FROM sys.columns
                WHERE object_id = OBJECT_ID(N'[Customers]')
                  AND name = N'PhoneNumber'
                  AND max_length < 40)
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'IX_Customers_PhoneNumber'
                      AND object_id = OBJECT_ID(N'[Customers]'))
                    DROP INDEX [IX_Customers_PhoneNumber] ON [Customers];

                ALTER TABLE [Customers] ALTER COLUMN [PhoneNumber] nvarchar(20) NULL;

                IF NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'IX_Customers_PhoneNumber'
                      AND object_id = OBJECT_ID(N'[Customers]'))
                    CREATE UNIQUE INDEX [IX_Customers_PhoneNumber]
                        ON [Customers] ([PhoneNumber])
                        WHERE [PhoneNumber] IS NOT NULL;
            END
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF EXISTS (
                SELECT 1 FROM sys.columns
                WHERE object_id = OBJECT_ID(N'[Customers]')
                  AND name = N'PhoneNumber'
                  AND max_length >= 40)
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'IX_Customers_PhoneNumber'
                      AND object_id = OBJECT_ID(N'[Customers]'))
                    DROP INDEX [IX_Customers_PhoneNumber] ON [Customers];

                ALTER TABLE [Customers] ALTER COLUMN [PhoneNumber] nvarchar(10) NULL;

                IF NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'IX_Customers_PhoneNumber'
                      AND object_id = OBJECT_ID(N'[Customers]'))
                    CREATE UNIQUE INDEX [IX_Customers_PhoneNumber]
                        ON [Customers] ([PhoneNumber])
                        WHERE [PhoneNumber] IS NOT NULL;
            END
            """);
    }
}
