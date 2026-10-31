using Microsoft.EntityFrameworkCore;

namespace VIVI.Infrastructure.Data;

public static class RetryableWork
{
    /// <summary>
    /// Runs a whole transactional unit under the DbContext's execution strategy. Needed because a retrying
    /// strategy (Database:RetryOnFailure) rejects user transactions started outside it. With retries off this
    /// just runs <paramref name="work"/> once. On a retry the change tracker is cleared so the unit reloads
    /// its entities and nothing from the failed attempt leaks into the next one.
    /// </summary>
    public static Task<T> RunRetryableAsync<T>(this ViviDbContext db, Func<Task<T>> work)
    {
        var attempt = 0;
        return db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            if (attempt++ > 0)
                db.ChangeTracker.Clear();
            return await work();
        });
    }
}
