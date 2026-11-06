using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VIVI.Infrastructure.Data;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

/// <summary>Admin-editable courier/delivery notice shown at checkout. Idempotent.</summary>
[DbContext(typeof(ViviDbContext))]
[Migration("20261106090000_AddShopDeliveryNotice")]
public sealed class AddShopDeliveryNotice : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
        => migrationBuilder.Sql(ShopSettingsSchemaSql.AddDeliveryNotice);

    protected override void Down(MigrationBuilder migrationBuilder)
        => migrationBuilder.Sql("IF COL_LENGTH(N'ShopSettings', N'DeliveryNotice') IS NOT NULL ALTER TABLE [ShopSettings] DROP COLUMN [DeliveryNotice];");
}
