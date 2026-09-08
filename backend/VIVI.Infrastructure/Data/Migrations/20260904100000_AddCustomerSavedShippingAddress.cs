using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VIVI.Infrastructure.Data;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations
{
    [DbContext(typeof(ViviDbContext))]
    [Migration("20260904100000_AddCustomerSavedShippingAddress")]
    public sealed class AddCustomerSavedShippingAddress : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ShipAddressLine1",
                table: "Customers",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ShipAddressLine2",
                table: "Customers",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ShipCity",
                table: "Customers",
                type: "nvarchar(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ShipCountry",
                table: "Customers",
                type: "nvarchar(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ShipFullName",
                table: "Customers",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ShipLandmark",
                table: "Customers",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ShipPhone",
                table: "Customers",
                type: "nvarchar(10)",
                maxLength: 10,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ShipPinCode",
                table: "Customers",
                type: "nvarchar(6)",
                maxLength: 6,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ShipState",
                table: "Customers",
                type: "nvarchar(80)",
                maxLength: 80,
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "ShipAddressLine1", table: "Customers");
            migrationBuilder.DropColumn(name: "ShipAddressLine2", table: "Customers");
            migrationBuilder.DropColumn(name: "ShipCity", table: "Customers");
            migrationBuilder.DropColumn(name: "ShipCountry", table: "Customers");
            migrationBuilder.DropColumn(name: "ShipFullName", table: "Customers");
            migrationBuilder.DropColumn(name: "ShipLandmark", table: "Customers");
            migrationBuilder.DropColumn(name: "ShipPhone", table: "Customers");
            migrationBuilder.DropColumn(name: "ShipPinCode", table: "Customers");
            migrationBuilder.DropColumn(name: "ShipState", table: "Customers");
        }
    }
}
