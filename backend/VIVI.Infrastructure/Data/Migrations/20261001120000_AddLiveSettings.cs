using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VIVI.Infrastructure.Data;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

[DbContext(typeof(ViviDbContext))]
[Migration("20261001120000_AddLiveSettings")]
public sealed class AddLiveSettings : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(LiveSettingsSchemaSql.Ddl);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF OBJECT_ID(N'[LiveSessionDefinitions]', N'U') IS NOT NULL DROP TABLE [LiveSessionDefinitions];
            IF OBJECT_ID(N'[LiveSettings]', N'U') IS NOT NULL DROP TABLE [LiveSettings];
            """);
    }
}
