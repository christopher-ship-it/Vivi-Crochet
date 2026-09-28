using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddLiveTutorDefault : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "HasCustomTutor",
                table: "LiveWeeks",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "LiveTutorDefaults",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TutorName = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    TutorPhotoBlobPath = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LiveTutorDefaults", x => x.Id);
                });

            // Preserve every week that already has its own name/photo from before this migration —
            // otherwise they'd silently start showing the (initially empty) shared default instead.
            migrationBuilder.Sql(
                """
                UPDATE [LiveWeeks]
                SET [HasCustomTutor] = 1
                WHERE [TutorPhotoBlobPath] IS NOT NULL OR [TutorName] <> N'SRI';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "LiveTutorDefaults");

            migrationBuilder.DropColumn(
                name: "HasCustomTutor",
                table: "LiveWeeks");
        }
    }
}
