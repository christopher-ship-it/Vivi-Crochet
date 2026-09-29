using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VIVI.Infrastructure.Data;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

/// <summary>Adds the admin-editable LaunchOfferCounters.PriceLabel caption. Idempotent.</summary>
[DbContext(typeof(ViviDbContext))]
[Migration("20260929180000_AddOfferPriceLabel")]
public sealed class AddOfferPriceLabel : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF OBJECT_ID(N'[LaunchOfferCounters]', N'U') IS NOT NULL
               AND COL_LENGTH('LaunchOfferCounters', 'PriceLabel') IS NULL
                ALTER TABLE [LaunchOfferCounters]
                ADD [PriceLabel] nvarchar(60) NOT NULL
                    CONSTRAINT [DF_LaunchOfferCounters_PriceLabel] DEFAULT N'Launch price';
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF COL_LENGTH('LaunchOfferCounters', 'PriceLabel') IS NOT NULL
            BEGIN
                ALTER TABLE [LaunchOfferCounters] DROP CONSTRAINT [DF_LaunchOfferCounters_PriceLabel];
                ALTER TABLE [LaunchOfferCounters] DROP COLUMN [PriceLabel];
            END
            """);
    }
}
