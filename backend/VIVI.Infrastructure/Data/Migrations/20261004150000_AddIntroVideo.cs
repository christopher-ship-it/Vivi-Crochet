using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VIVI.Infrastructure.Data;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

/// <summary>The app's welcome video (one row). Idempotent.</summary>
[DbContext(typeof(ViviDbContext))]
[Migration("20261004150000_AddIntroVideo")]
public sealed class AddIntroVideo : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
        => migrationBuilder.Sql(IntroVideoSchemaSql.CreateTable);

    protected override void Down(MigrationBuilder migrationBuilder)
        => migrationBuilder.Sql("IF OBJECT_ID(N'[IntroVideos]', N'U') IS NOT NULL DROP TABLE [IntroVideos];");
}
