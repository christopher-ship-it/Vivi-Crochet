using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VIVI.Infrastructure.Data;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

/// <summary>Shop switches (one row), e.g. hiding the Handmade Collection. Idempotent.</summary>
[DbContext(typeof(ViviDbContext))]
[Migration("20261031090000_AddShopSettings")]
public sealed class AddShopSettings : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
        => migrationBuilder.Sql(ShopSettingsSchemaSql.CreateTable);

    protected override void Down(MigrationBuilder migrationBuilder)
        => migrationBuilder.Sql("IF OBJECT_ID(N'[ShopSettings]', N'U') IS NOT NULL DROP TABLE [ShopSettings];");
}
