using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddLaunchMembership : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
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

            // Defaults preserve the already-seeded launch offer as active with its intended 1-year
            // membership window — existing rows must not be silently deactivated/expired by this migration.
            migrationBuilder.AddColumn<int>(
                name: "AccessDurationDays",
                table: "LaunchOfferCounters",
                type: "int",
                nullable: false,
                defaultValue: 365);

            migrationBuilder.AddColumn<bool>(
                name: "IsActive",
                table: "LaunchOfferCounters",
                type: "bit",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<string>(
                name: "OfferName",
                table: "LaunchOfferCounters",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "VIVI Founding Membership");

            migrationBuilder.AddColumn<Guid>(
                name: "ViralProjectCourseId",
                table: "LaunchOfferCounters",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "LaunchMemberships",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CourseId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MemberNumber = table.Column<int>(type: "int", nullable: false),
                    ViralProjectCourseId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    AccessStartDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    AccessExpiryDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    BadgeGrantedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LaunchMemberships", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LaunchMemberships_Courses_CourseId",
                        column: x => x.CourseId,
                        principalTable: "Courses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_LaunchMemberships_Courses_ViralProjectCourseId",
                        column: x => x.ViralProjectCourseId,
                        principalTable: "Courses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_LaunchMemberships_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_LaunchMemberships_OrderItems_OrderItemId",
                        column: x => x.OrderItemId,
                        principalTable: "OrderItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_LaunchMemberships_Orders_OrderId",
                        column: x => x.OrderId,
                        principalTable: "Orders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_LaunchOfferCounters_ViralProjectCourseId",
                table: "LaunchOfferCounters",
                column: "ViralProjectCourseId");

            migrationBuilder.CreateIndex(
                name: "IX_LaunchMemberships_CourseId_MemberNumber",
                table: "LaunchMemberships",
                columns: new[] { "CourseId", "MemberNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_LaunchMemberships_CustomerId",
                table: "LaunchMemberships",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_LaunchMemberships_OrderId",
                table: "LaunchMemberships",
                column: "OrderId");

            migrationBuilder.CreateIndex(
                name: "IX_LaunchMemberships_OrderItemId",
                table: "LaunchMemberships",
                column: "OrderItemId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_LaunchMemberships_ViralProjectCourseId",
                table: "LaunchMemberships",
                column: "ViralProjectCourseId");

            migrationBuilder.AddForeignKey(
                name: "FK_LaunchOfferCounters_Courses_ViralProjectCourseId",
                table: "LaunchOfferCounters",
                column: "ViralProjectCourseId",
                principalTable: "Courses",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_LaunchOfferCounters_Courses_ViralProjectCourseId",
                table: "LaunchOfferCounters");

            migrationBuilder.DropTable(
                name: "LaunchMemberships");

            migrationBuilder.DropIndex(
                name: "IX_LaunchOfferCounters_ViralProjectCourseId",
                table: "LaunchOfferCounters");

            migrationBuilder.DropColumn(
                name: "AccessDurationDays",
                table: "LaunchOfferCounters");

            migrationBuilder.DropColumn(
                name: "IsActive",
                table: "LaunchOfferCounters");

            migrationBuilder.DropColumn(
                name: "OfferName",
                table: "LaunchOfferCounters");

            migrationBuilder.DropColumn(
                name: "ViralProjectCourseId",
                table: "LaunchOfferCounters");

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
}
