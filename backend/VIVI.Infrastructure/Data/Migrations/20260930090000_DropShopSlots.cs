using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VIVI.Infrastructure.Commerce;
using VIVI.Infrastructure.Data;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

/// <summary>Removes legacy ShopSlots / ShopSlotProducts tables. Product catalog columns are kept.</summary>
[DbContext(typeof(ViviDbContext))]
[Migration("20260930090000_DropShopSlots")]
public sealed class DropShopSlots : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(ShopSlotSchemaBootstrapper.DropLegacySlotsSql);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Intentionally empty — shop slots feature was removed and is not restored.
    }
}
