using Microsoft.EntityFrameworkCore;
using VIVI.Infrastructure.Data;

namespace VIVI.Infrastructure.Push;

/// <summary>
/// Ensures push token tables/columns exist when AutoMigrate is false
/// (same recovery pattern as LiveSchemaBootstrapper).
/// </summary>
public static class PushSchemaBootstrapper
{
    public static async Task EnsureAsync(ViviDbContext db, CancellationToken cancellationToken)
    {
        // Columns first (independent of DevicePushTokens).
        await db.Database.ExecuteSqlRawAsync(
            """
            IF COL_LENGTH('Customers', 'OnboardingPushesSentAt') IS NULL
                ALTER TABLE [Customers] ADD [OnboardingPushesSentAt] datetime2 NULL;
            """,
            cancellationToken);

        await db.Database.ExecuteSqlRawAsync(
            """
            IF COL_LENGTH('Customers', 'LastWeeklyPushAt') IS NULL
                ALTER TABLE [Customers] ADD [LastWeeklyPushAt] datetime2 NULL;
            """,
            cancellationToken);

        await db.Database.ExecuteSqlRawAsync(
            """
            IF OBJECT_ID(N'[DevicePushTokens]', N'U') IS NULL
            BEGIN
                CREATE TABLE [DevicePushTokens] (
                    [Id] uniqueidentifier NOT NULL,
                    [CustomerId] uniqueidentifier NOT NULL,
                    [ExpoPushToken] nvarchar(200) NOT NULL,
                    [Platform] nvarchar(20) NOT NULL,
                    [IsActive] bit NOT NULL CONSTRAINT [DF_DevicePushTokens_IsActive] DEFAULT (1),
                    [CreatedAt] datetime2 NOT NULL,
                    [UpdatedAt] datetime2 NOT NULL,
                    CONSTRAINT [PK_DevicePushTokens] PRIMARY KEY ([Id])
                );
            END
            """,
            cancellationToken);

        // Indexes / FK added separately so a partial create can still recover.
        await db.Database.ExecuteSqlRawAsync(
            """
            IF OBJECT_ID(N'[DevicePushTokens]', N'U') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'IX_DevicePushTokens_ExpoPushToken'
                      AND object_id = OBJECT_ID(N'[DevicePushTokens]'))
                CREATE UNIQUE INDEX [IX_DevicePushTokens_ExpoPushToken]
                    ON [DevicePushTokens] ([ExpoPushToken]);
            """,
            cancellationToken);

        await db.Database.ExecuteSqlRawAsync(
            """
            IF OBJECT_ID(N'[DevicePushTokens]', N'U') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'IX_DevicePushTokens_CustomerId'
                      AND object_id = OBJECT_ID(N'[DevicePushTokens]'))
                CREATE INDEX [IX_DevicePushTokens_CustomerId]
                    ON [DevicePushTokens] ([CustomerId]);
            """,
            cancellationToken);

        await db.Database.ExecuteSqlRawAsync(
            """
            IF OBJECT_ID(N'[DevicePushTokens]', N'U') IS NOT NULL
               AND OBJECT_ID(N'[Customers]', N'U') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1 FROM sys.foreign_keys
                    WHERE name = N'FK_DevicePushTokens_Customers_CustomerId')
                ALTER TABLE [DevicePushTokens] WITH CHECK
                ADD CONSTRAINT [FK_DevicePushTokens_Customers_CustomerId]
                    FOREIGN KEY ([CustomerId]) REFERENCES [Customers] ([Id]) ON DELETE CASCADE;
            """,
            cancellationToken);
    }
}

