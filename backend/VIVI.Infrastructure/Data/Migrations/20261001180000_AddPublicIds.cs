using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VIVI.Infrastructure.Data;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

/// <summary>
/// Adds Customers.CustomerCode and LaunchMemberships.MemberCode. Existing rows are given IDs at
/// startup by PublicIdSchema.BackfillAsync.
/// </summary>
[DbContext(typeof(ViviDbContext))]
[Migration("20261001180000_AddPublicIds")]
public sealed class AddPublicIds : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        foreach (var statement in PublicIdSchema.Statements)
            migrationBuilder.Sql(statement);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Customers_CustomerCode')
                DROP INDEX [IX_Customers_CustomerCode] ON [Customers];
            IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_LaunchMemberships_MemberCode')
                DROP INDEX [IX_LaunchMemberships_MemberCode] ON [LaunchMemberships];
            """);
        migrationBuilder.Sql("""
            IF COL_LENGTH('Customers', 'CustomerCode') IS NOT NULL
                ALTER TABLE [Customers] DROP COLUMN [CustomerCode];
            IF COL_LENGTH('LaunchMemberships', 'MemberCode') IS NOT NULL
                ALTER TABLE [LaunchMemberships] DROP COLUMN [MemberCode];
            """);
    }
}
