using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VIVI.Infrastructure.Data;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

/// <summary>Adds admin-editable app badge texts (live / ended) to LaunchOfferCounters. Idempotent.</summary>
[DbContext(typeof(ViviDbContext))]
[Migration("20260929200000_AddOfferBadgeTexts")]
public sealed class AddOfferBadgeTexts : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF OBJECT_ID(N'[LaunchOfferCounters]', N'U') IS NOT NULL
               AND COL_LENGTH('LaunchOfferCounters', 'BadgeText') IS NULL
                ALTER TABLE [LaunchOfferCounters] ADD [BadgeText] nvarchar(80) NULL;

            IF OBJECT_ID(N'[LaunchOfferCounters]', N'U') IS NOT NULL
               AND COL_LENGTH('LaunchOfferCounters', 'EndedBadgeText') IS NULL
                ALTER TABLE [LaunchOfferCounters] ADD [EndedBadgeText] nvarchar(80) NULL;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF COL_LENGTH('LaunchOfferCounters', 'BadgeText') IS NOT NULL
                ALTER TABLE [LaunchOfferCounters] DROP COLUMN [BadgeText];
            IF COL_LENGTH('LaunchOfferCounters', 'EndedBadgeText') IS NOT NULL
                ALTER TABLE [LaunchOfferCounters] DROP COLUMN [EndedBadgeText];
            """);
    }
}
