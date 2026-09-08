using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddProductTypeAndOrderDelivery : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ProductType",
                table: "Products",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeliveryDateOverriddenAt",
                table: "Orders",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DeliveryDateOverriddenBy",
                table: "Orders",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeliveryDateOverrideReason",
                table: "Orders",
                type: "nvarchar(400)",
                maxLength: 400,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "DeliveryEstimateMaxDays",
                table: "Orders",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "DeliveryEstimateMinDays",
                table: "Orders",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "EstimatedDeliveryDateFrom",
                table: "Orders",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "EstimatedDeliveryDateTo",
                table: "Orders",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsCoimbatoreDelivery",
                table: "Orders",
                type: "bit",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ManualDeliveryDateFrom",
                table: "Orders",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ManualDeliveryDateTo",
                table: "Orders",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ShipAddressLine1",
                table: "Orders",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ShipAddressLine2",
                table: "Orders",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ShipCity",
                table: "Orders",
                type: "nvarchar(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ShipCountry",
                table: "Orders",
                type: "nvarchar(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ShipFullName",
                table: "Orders",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ShipLandmark",
                table: "Orders",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ShipPhone",
                table: "Orders",
                type: "nvarchar(10)",
                maxLength: 10,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ShipPinCode",
                table: "Orders",
                type: "nvarchar(6)",
                maxLength: 6,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ShipState",
                table: "Orders",
                type: "nvarchar(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "OrderDeliveryUpdates",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PreviousDateFrom = table.Column<DateTime>(type: "datetime2", nullable: false),
                    PreviousDateTo = table.Column<DateTime>(type: "datetime2", nullable: false),
                    NewDateFrom = table.Column<DateTime>(type: "datetime2", nullable: false),
                    NewDateTo = table.Column<DateTime>(type: "datetime2", nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(400)", maxLength: 400, nullable: true),
                    ChangedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ChangedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OrderDeliveryUpdates", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OrderDeliveryUpdates_AdminUsers_ChangedBy",
                        column: x => x.ChangedBy,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OrderDeliveryUpdates_Orders_OrderId",
                        column: x => x.OrderId,
                        principalTable: "Orders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Products_ProductType",
                table: "Products",
                column: "ProductType");

            migrationBuilder.CreateIndex(
                name: "IX_Orders_DeliveryDateOverriddenBy",
                table: "Orders",
                column: "DeliveryDateOverriddenBy");

            migrationBuilder.CreateIndex(
                name: "IX_OrderDeliveryUpdates_ChangedAt",
                table: "OrderDeliveryUpdates",
                column: "ChangedAt");

            migrationBuilder.CreateIndex(
                name: "IX_OrderDeliveryUpdates_ChangedBy",
                table: "OrderDeliveryUpdates",
                column: "ChangedBy");

            migrationBuilder.CreateIndex(
                name: "IX_OrderDeliveryUpdates_OrderId",
                table: "OrderDeliveryUpdates",
                column: "OrderId");

            migrationBuilder.AddForeignKey(
                name: "FK_Orders_AdminUsers_DeliveryDateOverriddenBy",
                table: "Orders",
                column: "DeliveryDateOverriddenBy",
                principalTable: "AdminUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Orders_AdminUsers_DeliveryDateOverriddenBy",
                table: "Orders");

            migrationBuilder.DropTable(
                name: "OrderDeliveryUpdates");

            migrationBuilder.DropIndex(
                name: "IX_Products_ProductType",
                table: "Products");

            migrationBuilder.DropIndex(
                name: "IX_Orders_DeliveryDateOverriddenBy",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "ProductType",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "DeliveryDateOverriddenAt",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "DeliveryDateOverriddenBy",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "DeliveryDateOverrideReason",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "DeliveryEstimateMaxDays",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "DeliveryEstimateMinDays",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "EstimatedDeliveryDateFrom",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "EstimatedDeliveryDateTo",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "IsCoimbatoreDelivery",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "ManualDeliveryDateFrom",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "ManualDeliveryDateTo",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "ShipAddressLine1",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "ShipAddressLine2",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "ShipCity",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "ShipCountry",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "ShipFullName",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "ShipLandmark",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "ShipPhone",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "ShipPinCode",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "ShipState",
                table: "Orders");
        }
    }
}
