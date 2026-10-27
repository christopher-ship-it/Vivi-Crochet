using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VIVI.Infrastructure.Data;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

/// <summary>Adds the admin "show in app" switch (IsVisible) to LaunchOfferCounters. Idempotent.</summary>
[DbContext(typeof(ViviDbContext))]
[Migration("20261028100000_AddOfferIsVisible")]
public sealed class AddOfferIsVisible : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF OBJECT_ID(N'[LaunchOfferCounters]', N'U') IS NOT NULL
               AND COL_LENGTH('LaunchOfferCounters', 'IsVisible') IS NULL
                ALTER TABLE [LaunchOfferCounters]
                ADD [IsVisible] bit NOT NULL
                    CONSTRAINT [DF_LaunchOfferCounters_IsVisible] DEFAULT CAST(1 AS bit);
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF COL_LENGTH('LaunchOfferCounters', 'IsVisible') IS NOT NULL
            BEGIN
                IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_LaunchOfferCounters_IsVisible')
                    ALTER TABLE [LaunchOfferCounters] DROP CONSTRAINT [DF_LaunchOfferCounters_IsVisible];
                ALTER TABLE [LaunchOfferCounters] DROP COLUMN [IsVisible];
            END
            """);
    }
}
