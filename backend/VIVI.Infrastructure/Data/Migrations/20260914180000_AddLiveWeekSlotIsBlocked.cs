using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VIVI.Infrastructure.Data;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

[DbContext(typeof(ViviDbContext))]
[Migration("20260914180000_AddLiveWeekSlotIsBlocked")]
public sealed class AddLiveWeekSlotIsBlocked : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF COL_LENGTH('LiveWeekSlots', 'IsBlocked') IS NULL
                ALTER TABLE [LiveWeekSlots]
                ADD [IsBlocked] bit NOT NULL
                    CONSTRAINT [DF_LiveWeekSlots_IsBlocked] DEFAULT CAST(0 AS bit);
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF COL_LENGTH('LiveWeekSlots', 'IsBlocked') IS NOT NULL
            BEGIN
                DECLARE @df sysname;
                SELECT @df = dc.name
                FROM sys.default_constraints dc
                INNER JOIN sys.columns c
                    ON c.default_object_id = dc.object_id
                WHERE dc.parent_object_id = OBJECT_ID(N'[LiveWeekSlots]')
                  AND c.name = N'IsBlocked';
                IF @df IS NOT NULL
                    EXEC(N'ALTER TABLE [LiveWeekSlots] DROP CONSTRAINT [' + @df + N']');
                ALTER TABLE [LiveWeekSlots] DROP COLUMN [IsBlocked];
            END
            """);
    }
}
