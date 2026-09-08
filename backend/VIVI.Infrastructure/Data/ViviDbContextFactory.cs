using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace VIVI.Infrastructure.Data;

/// <summary>
/// Used by `dotnet ef` at design time. Prefers the environment connection string.
/// </summary>
public sealed class ViviDbContextFactory : IDesignTimeDbContextFactory<ViviDbContext>
{
    public ViviDbContext CreateDbContext(string[] args)
    {
        var connectionString =
            Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection")
            ?? "Server=(localdb)\\mssqllocaldb;Database=ViviCrochet;Trusted_Connection=True;MultipleActiveResultSets=true;TrustServerCertificate=True";

        var options = new DbContextOptionsBuilder<ViviDbContext>()
            .UseSqlServer(connectionString)
            .Options;

        return new ViviDbContext(options);
    }
}
