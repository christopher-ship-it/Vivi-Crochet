using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VIVI.Infrastructure.Data;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

/// <summary>Admin reply on a support inquiry. Idempotent.</summary>
[DbContext(typeof(ViviDbContext))]
[Migration("20261021120000_AddSupportReply")]
public sealed class AddSupportReply : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
        => migrationBuilder.Sql("""
            IF COL_LENGTH(N'SupportInquiries', N'Reply') IS NULL
                ALTER TABLE [SupportInquiries] ADD [Reply] nvarchar(2000) NULL, [RepliedAt] datetime2 NULL;
            """);

    protected override void Down(MigrationBuilder migrationBuilder)
        => migrationBuilder.Sql("""
            IF COL_LENGTH(N'SupportInquiries', N'Reply') IS NOT NULL
                ALTER TABLE [SupportInquiries] DROP COLUMN [Reply], [RepliedAt];
            """);
}
