using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

/// <inheritdoc />
public partial class RemoveGooglePlayBilling : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(
            name: "IX_Courses_GooglePlayProductId",
            table: "Courses");

        migrationBuilder.DropColumn(
            name: "GooglePlayProductId",
            table: "Courses");

        migrationBuilder.DropColumn(
            name: "GooglePlayRenewalProductId",
            table: "Courses");

        migrationBuilder.DropColumn(
            name: "GooglePlayProductId",
            table: "OrderItems");
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "GooglePlayProductId",
            table: "OrderItems",
            type: "nvarchar(128)",
            maxLength: 128,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "GooglePlayProductId",
            table: "Courses",
            type: "nvarchar(128)",
            maxLength: 128,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "GooglePlayRenewalProductId",
            table: "Courses",
            type: "nvarchar(128)",
            maxLength: 128,
            nullable: true);

        migrationBuilder.CreateIndex(
            name: "IX_Courses_GooglePlayProductId",
            table: "Courses",
            column: "GooglePlayProductId",
            unique: true,
            filter: "[GooglePlayProductId] IS NOT NULL");
    }
}
