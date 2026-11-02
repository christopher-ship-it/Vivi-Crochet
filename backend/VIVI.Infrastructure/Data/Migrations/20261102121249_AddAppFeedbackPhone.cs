using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddAppFeedbackPhone : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Phone",
                table: "AppFeedbacks",
                type: "nvarchar(max)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Phone",
                table: "AppFeedbacks");
        }
    }
}
