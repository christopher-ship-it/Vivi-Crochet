using Microsoft.EntityFrameworkCore;

namespace VIVI.Infrastructure.Data;

/// <summary>Ensures the AppFeedbacks table exists when AutoMigrate is false (same pattern as AppHealthSchemaBootstrapper).</summary>
public static class AppFeedbackSchemaBootstrapper
{
    public static async Task EnsureAsync(ViviDbContext db, CancellationToken cancellationToken)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            IF OBJECT_ID(N'[AppFeedbacks]', N'U') IS NULL
            BEGIN
                CREATE TABLE [AppFeedbacks] (
                    [Id] uniqueidentifier NOT NULL,
                    [Rating] int NOT NULL,
                    [Message] nvarchar(1000) NULL,
                    [Screen] nvarchar(200) NULL,
                    [AppVersion] nvarchar(40) NULL,
                    [Platform] nvarchar(40) NULL,
                    [SecondsInApp] int NOT NULL CONSTRAINT [DF_AppFeedbacks_SecondsInApp] DEFAULT (0),
                    [CreatedAt] datetime2 NOT NULL,
                    [IsResolved] bit NOT NULL CONSTRAINT [DF_AppFeedbacks_IsResolved] DEFAULT (0),
                    [ResolvedAt] datetime2 NULL,
                    CONSTRAINT [PK_AppFeedbacks] PRIMARY KEY ([Id])
                );
            END
            """,
            cancellationToken);

        await db.Database.ExecuteSqlRawAsync(
            """
            IF OBJECT_ID(N'[AppFeedbacks]', N'U') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'IX_AppFeedbacks_CreatedAt'
                      AND object_id = OBJECT_ID(N'[AppFeedbacks]'))
                CREATE INDEX [IX_AppFeedbacks_CreatedAt] ON [AppFeedbacks] ([CreatedAt]);
            """,
            cancellationToken);
    }
}
