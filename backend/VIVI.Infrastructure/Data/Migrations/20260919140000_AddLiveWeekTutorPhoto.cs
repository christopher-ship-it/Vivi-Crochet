using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VIVI.Infrastructure.Data;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

[DbContext(typeof(ViviDbContext))]
[Migration("20260919140000_AddLiveWeekTutorPhoto")]
public sealed class AddLiveWeekTutorPhoto : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF COL_LENGTH('LiveWeeks', 'TutorName') IS NULL
                ALTER TABLE [LiveWeeks]
                ADD [TutorName] nvarchar(100) NOT NULL
                    CONSTRAINT [DF_LiveWeeks_TutorName] DEFAULT N'SRI';

            IF COL_LENGTH('LiveWeeks', 'TutorPhotoBlobPath') IS NULL
                ALTER TABLE [LiveWeeks]
                ADD [TutorPhotoBlobPath] nvarchar(500) NULL;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF COL_LENGTH('LiveWeeks', 'TutorPhotoBlobPath') IS NOT NULL
                ALTER TABLE [LiveWeeks] DROP COLUMN [TutorPhotoBlobPath];

            IF COL_LENGTH('LiveWeeks', 'TutorName') IS NOT NULL
            BEGIN
                DECLARE @df sysname;
                SELECT @df = dc.name
                FROM sys.default_constraints dc
                INNER JOIN sys.columns c
                    ON c.default_object_id = dc.object_id
                WHERE dc.parent_object_id = OBJECT_ID(N'[LiveWeeks]')
                  AND c.name = N'TutorName';
                IF @df IS NOT NULL
                    EXEC(N'ALTER TABLE [LiveWeeks] DROP CONSTRAINT [' + @df + N']');
                ALTER TABLE [LiveWeeks] DROP COLUMN [TutorName];
            END
            """);
    }
}
