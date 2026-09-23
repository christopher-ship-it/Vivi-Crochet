using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VIVI.Infrastructure.Data;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

[DbContext(typeof(ViviDbContext))]
[Migration("20260921180000_AddCourseSortOrder")]
public sealed class AddCourseSortOrder : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF COL_LENGTH('Courses', 'SortOrder') IS NULL
                ALTER TABLE [Courses] ADD [SortOrder] int NOT NULL
                    CONSTRAINT [DF_Courses_SortOrder] DEFAULT (0);

            IF NOT EXISTS (
                SELECT 1 FROM sys.indexes
                WHERE name = N'IX_Courses_CategoryId_SortOrder'
                  AND object_id = OBJECT_ID(N'[Courses]'))
                CREATE INDEX [IX_Courses_CategoryId_SortOrder]
                    ON [Courses] ([CategoryId], [SortOrder]);
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF EXISTS (
                SELECT 1 FROM sys.indexes
                WHERE name = N'IX_Courses_CategoryId_SortOrder'
                  AND object_id = OBJECT_ID(N'[Courses]'))
                DROP INDEX [IX_Courses_CategoryId_SortOrder] ON [Courses];

            IF COL_LENGTH('Courses', 'SortOrder') IS NOT NULL
            BEGIN
                DECLARE @df sysname;
                SELECT @df = dc.name
                FROM sys.default_constraints dc
                INNER JOIN sys.columns c
                    ON c.default_object_id = dc.object_id
                WHERE dc.parent_object_id = OBJECT_ID(N'[Courses]')
                  AND c.name = N'SortOrder';
                IF @df IS NOT NULL
                    EXEC(N'ALTER TABLE [Courses] DROP CONSTRAINT [' + @df + N']');
                ALTER TABLE [Courses] DROP COLUMN [SortOrder];
            END
            """);
    }
}
