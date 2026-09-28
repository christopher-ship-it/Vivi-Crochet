using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

/// <inheritdoc />
public partial class AddGooglePlayBilling : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
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

        migrationBuilder.AddColumn<string>(
            name: "GooglePlayProductId",
            table: "OrderItems",
            type: "nvarchar(128)",
            maxLength: 128,
            nullable: true);

        migrationBuilder.AlterColumn<string>(
            name: "ProviderPaymentId",
            table: "Payments",
            type: "nvarchar(512)",
            maxLength: 512,
            nullable: true,
            oldClrType: typeof(string),
            oldType: "nvarchar(64)",
            oldMaxLength: 64,
            oldNullable: true);

        migrationBuilder.CreateIndex(
            name: "IX_Courses_GooglePlayProductId",
            table: "Courses",
            column: "GooglePlayProductId",
            unique: true,
            filter: "[GooglePlayProductId] IS NOT NULL");
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
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

        migrationBuilder.AlterColumn<string>(
            name: "ProviderPaymentId",
            table: "Payments",
            type: "nvarchar(64)",
            maxLength: 64,
            nullable: true,
            oldClrType: typeof(string),
            oldType: "nvarchar(512)",
            oldMaxLength: 512,
            oldNullable: true);
    }
}
