using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddProductAvailableStock : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "AvailableStock",
                table: "Products",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<bool>(
                name: "InventoryDeducted",
                table: "Orders",
                type: "bit",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AvailableStock",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "InventoryDeducted",
                table: "Orders");
        }
    }
}
