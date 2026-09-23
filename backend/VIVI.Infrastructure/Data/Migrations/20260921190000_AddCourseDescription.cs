using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VIVI.Infrastructure.Data;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

[DbContext(typeof(ViviDbContext))]
[Migration("20260921190000_AddCourseDescription")]
public sealed class AddCourseDescription : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF COL_LENGTH('Courses', 'Description') IS NULL
                ALTER TABLE [Courses] ADD [Description] nvarchar(400) NULL;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF COL_LENGTH('Courses', 'Description') IS NOT NULL
                ALTER TABLE [Courses] DROP COLUMN [Description];
            """);
    }
}
