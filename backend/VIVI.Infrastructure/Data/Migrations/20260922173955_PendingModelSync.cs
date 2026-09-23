using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

/// <summary>
/// Snapshot-only sync. Earlier SQL migrations (essentials links, ship phone/postal
/// widen, push tokens, etc.) already applied the schema but did not refresh
/// <see cref="ViviDbContextModelSnapshot"/>, so EF blocked <c>database update</c>
/// with PendingModelChangesWarning. This migration carries no DDL.
/// </summary>
public partial class PendingModelSync : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Intentionally empty — ProductEssentialLinks and related schema already
        // exist via prior idempotent SQL migrations (e.g. 20260921140000).
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Intentionally empty.
    }
}



