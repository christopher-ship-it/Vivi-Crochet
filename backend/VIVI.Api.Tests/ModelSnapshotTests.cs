using Microsoft.EntityFrameworkCore;
using VIVI.Infrastructure.Data;
using Xunit;

namespace VIVI.Api.Tests;

public sealed class ModelSnapshotTests
{
    /// <summary>
    /// When the model differs from ViviDbContextModelSnapshot, EF's MigrateAsync throws
    /// PendingModelChangesWarning at startup and every schema bootstrapper after it is skipped.
    /// Catch that here instead of in production.
    /// </summary>
    [Fact]
    public void Model_matches_snapshot()
    {
        var options = new DbContextOptionsBuilder<ViviDbContext>()
            .UseSqlServer("Server=localhost;Database=snapshot-check;Trusted_Connection=True;TrustServerCertificate=True")
            .Options;

        using var db = new ViviDbContext(options);

        Assert.False(
            db.Database.HasPendingModelChanges(),
            "The EF model has changes that are not in ViviDbContextModelSnapshot. Update the snapshot.");
    }
}
