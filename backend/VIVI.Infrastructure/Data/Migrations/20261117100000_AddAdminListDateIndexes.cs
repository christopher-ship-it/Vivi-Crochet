using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VIVI.Infrastructure.Data;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

/// <summary>Date indexes so the admin order, payment, user-metric and OTP lists sort and filter without scanning. Idempotent.</summary>
[DbContext(typeof(ViviDbContext))]
[Migration("20261117100000_AddAdminListDateIndexes")]
public sealed class AddAdminListDateIndexes : Migration
{
    private static readonly (string Table, string Column)[] Indexes =
    [
        ("Orders", "CreatedAt"),
        ("Payments", "CreatedAt"),
        ("VideoProgress", "UpdatedAt"),
        ("Customers", "CreatedAt"),
        ("OtpChallenges", "CreatedAt"),
    ];

    protected override void Up(MigrationBuilder migrationBuilder)
    {
        foreach (var (table, column) in Indexes)
        {
            migrationBuilder.Sql(
                $"IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_{table}_{column}' AND object_id = OBJECT_ID(N'[{table}]')) " +
                $"CREATE INDEX [IX_{table}_{column}] ON [{table}] ([{column}]);");
        }
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        foreach (var (table, column) in Indexes)
        {
            migrationBuilder.Sql(
                $"IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_{table}_{column}' AND object_id = OBJECT_ID(N'[{table}]')) " +
                $"DROP INDEX [IX_{table}_{column}] ON [{table}];");
        }
    }
}
