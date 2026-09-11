using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VIVI.Infrastructure.Data;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

[DbContext(typeof(ViviDbContext))]
[Migration("20260909173000_AddCourseThumbnailUrl")]
public sealed class AddCourseThumbnailUrl : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Idempotent — safe if column already exists on some environments.
        migrationBuilder.Sql("""
            IF COL_LENGTH('Courses', 'ThumbnailUrl') IS NULL
            BEGIN
                ALTER TABLE Courses ADD ThumbnailUrl nvarchar(512) NULL;
            END
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF COL_LENGTH('Courses', 'ThumbnailUrl') IS NOT NULL
            BEGIN
                ALTER TABLE Courses DROP COLUMN ThumbnailUrl;
            END
            """);
    }
}
