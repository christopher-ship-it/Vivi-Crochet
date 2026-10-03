using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VIVI.Infrastructure.Data;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

[DbContext(typeof(ViviDbContext))]
[Migration("20261003120000_AddVideoProgress")]
public sealed class AddVideoProgress : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(VideoProgressSchemaSql.CreateTable);
        migrationBuilder.Sql(VideoProgressSchemaSql.CreateUniqueIndex);
        migrationBuilder.Sql(VideoProgressSchemaSql.CreateCourseIndex);
        migrationBuilder.Sql(VideoProgressSchemaSql.CreateVideoIndex);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(VideoProgressSchemaSql.DropTable);
    }
}
