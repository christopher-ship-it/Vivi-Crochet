using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VIVI.Infrastructure.Data;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

/// <summary>Live courses (Basic / Intermediate / Advanced / Artist pack) and the course on each booking. Idempotent.</summary>
[DbContext(typeof(ViviDbContext))]
[Migration("20261103090000_AddLiveCourses")]
public sealed class AddLiveCourses : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
        => migrationBuilder.Sql(LiveCourseSchemaSql.Ddl);

    protected override void Down(MigrationBuilder migrationBuilder)
        => migrationBuilder.Sql("IF OBJECT_ID(N'[LiveCourses]', N'U') IS NOT NULL DROP TABLE [LiveCourses];");
}
