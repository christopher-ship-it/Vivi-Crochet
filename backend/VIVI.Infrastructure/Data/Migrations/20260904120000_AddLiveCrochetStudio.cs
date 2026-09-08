using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VIVI.Infrastructure.Data;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

[DbContext(typeof(ViviDbContext))]
[Migration("20260904120000_AddLiveCrochetStudio")]
public sealed class AddLiveCrochetStudio : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<Guid>(
            name: "LiveWeekId",
            table: "OrderItems",
            type: "uniqueidentifier",
            nullable: true);

        migrationBuilder.AddColumn<int>(
            name: "LiveSlotType",
            table: "OrderItems",
            type: "int",
            nullable: true);

        migrationBuilder.CreateTable(
            name: "LiveWeeks",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                WeekNumber = table.Column<int>(type: "int", nullable: false),
                SeasonYear = table.Column<int>(type: "int", nullable: false),
                StartDate = table.Column<DateOnly>(type: "date", nullable: false),
                EndDate = table.Column<DateOnly>(type: "date", nullable: false),
                BreakWeekday = table.Column<int>(type: "int", nullable: true),
                IsBookable = table.Column<bool>(type: "bit", nullable: false),
                CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
            },
            constraints: table => table.PrimaryKey("PK_LiveWeeks", x => x.Id));

        migrationBuilder.CreateTable(
            name: "LiveWeekSlots",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                LiveWeekId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                SlotType = table.Column<int>(type: "int", nullable: false),
                SeatCapacity = table.Column<int>(type: "int", nullable: false),
                SeatsBooked = table.Column<int>(type: "int", nullable: false),
                CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_LiveWeekSlots", x => x.Id);
                table.ForeignKey(
                    name: "FK_LiveWeekSlots_LiveWeeks_LiveWeekId",
                    column: x => x.LiveWeekId,
                    principalTable: "LiveWeeks",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateTable(
            name: "LiveBookings",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                CustomerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                LiveWeekId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                SlotType = table.Column<int>(type: "int", nullable: false),
                OrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                OrderItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                Status = table.Column<int>(type: "int", nullable: false),
                ReservationExpiresAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                ConfirmedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_LiveBookings", x => x.Id);
                table.ForeignKey(
                    name: "FK_LiveBookings_Customers_CustomerId",
                    column: x => x.CustomerId,
                    principalTable: "Customers",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Restrict);
                table.ForeignKey(
                    name: "FK_LiveBookings_LiveWeeks_LiveWeekId",
                    column: x => x.LiveWeekId,
                    principalTable: "LiveWeeks",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Restrict);
                table.ForeignKey(
                    name: "FK_LiveBookings_Orders_OrderId",
                    column: x => x.OrderId,
                    principalTable: "Orders",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Restrict);
                table.ForeignKey(
                    name: "FK_LiveBookings_OrderItems_OrderItemId",
                    column: x => x.OrderItemId,
                    principalTable: "OrderItems",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Restrict);
            });

        migrationBuilder.CreateIndex(
            name: "IX_OrderItems_LiveWeekId",
            table: "OrderItems",
            column: "LiveWeekId");

        migrationBuilder.CreateIndex(
            name: "IX_LiveWeeks_SeasonYear_WeekNumber",
            table: "LiveWeeks",
            columns: new[] { "SeasonYear", "WeekNumber" },
            unique: true);

        migrationBuilder.CreateIndex(
            name: "IX_LiveWeeks_StartDate",
            table: "LiveWeeks",
            column: "StartDate");

        migrationBuilder.CreateIndex(
            name: "IX_LiveWeekSlots_LiveWeekId_SlotType",
            table: "LiveWeekSlots",
            columns: new[] { "LiveWeekId", "SlotType" },
            unique: true);

        migrationBuilder.CreateIndex(
            name: "IX_LiveBookings_CustomerId_LiveWeekId_SlotType",
            table: "LiveBookings",
            columns: new[] { "CustomerId", "LiveWeekId", "SlotType" });

        migrationBuilder.CreateIndex(
            name: "IX_LiveBookings_OrderId",
            table: "LiveBookings",
            column: "OrderId",
            unique: true);

        migrationBuilder.CreateIndex(
            name: "IX_LiveBookings_LiveWeekId",
            table: "LiveBookings",
            column: "LiveWeekId");

        migrationBuilder.CreateIndex(
            name: "IX_LiveBookings_OrderItemId",
            table: "LiveBookings",
            column: "OrderItemId");

        migrationBuilder.CreateIndex(
            name: "IX_LiveBookings_CustomerId",
            table: "LiveBookings",
            column: "CustomerId");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "LiveBookings");
        migrationBuilder.DropTable(name: "LiveWeekSlots");
        migrationBuilder.DropTable(name: "LiveWeeks");
        migrationBuilder.DropIndex(name: "IX_OrderItems_LiveWeekId", table: "OrderItems");
        migrationBuilder.DropColumn(name: "LiveWeekId", table: "OrderItems");
        migrationBuilder.DropColumn(name: "LiveSlotType", table: "OrderItems");
    }
}
