using Microsoft.EntityFrameworkCore;
using VIVI.Infrastructure.Data;

namespace VIVI.Infrastructure.Commerce;

/// <summary>
/// Ensures the Founding Membership tables/columns exist even if a hand-written EF migration
/// was not recorded in __EFMigrationsHistory (production recovery path).
/// </summary>
public static class LaunchMembershipSchemaBootstrapper
{
    public static async Task EnsureAsync(ViviDbContext db, CancellationToken cancellationToken)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            IF OBJECT_ID(N'[LaunchOfferCounters]', N'U') IS NOT NULL
               AND COL_LENGTH('LaunchOfferCounters', 'OfferName') IS NULL
                ALTER TABLE [LaunchOfferCounters]
                ADD [OfferName] nvarchar(200) NOT NULL
                    CONSTRAINT [DF_LaunchOfferCounters_OfferName] DEFAULT N'VIVI Founding Membership';

            IF OBJECT_ID(N'[LaunchOfferCounters]', N'U') IS NOT NULL
               AND COL_LENGTH('LaunchOfferCounters', 'IsActive') IS NULL
                ALTER TABLE [LaunchOfferCounters]
                ADD [IsActive] bit NOT NULL
                    CONSTRAINT [DF_LaunchOfferCounters_IsActive] DEFAULT CAST(1 AS bit);

            IF OBJECT_ID(N'[LaunchOfferCounters]', N'U') IS NOT NULL
               AND COL_LENGTH('LaunchOfferCounters', 'AccessDurationDays') IS NULL
                ALTER TABLE [LaunchOfferCounters]
                ADD [AccessDurationDays] int NOT NULL
                    CONSTRAINT [DF_LaunchOfferCounters_AccessDurationDays] DEFAULT 365;

            IF OBJECT_ID(N'[LaunchOfferCounters]', N'U') IS NOT NULL
               AND COL_LENGTH('LaunchOfferCounters', 'ViralProjectCourseId') IS NULL
                ALTER TABLE [LaunchOfferCounters]
                ADD [ViralProjectCourseId] uniqueidentifier NULL;

            -- NO ACTION (not SET NULL): Courses already reaches LaunchOfferCounters via a CASCADE
            -- path (CourseId). A second cascading path from the same table makes SQL Server refuse
            -- the constraint ("may cause cycles or multiple cascade paths").
            IF OBJECT_ID(N'[LaunchOfferCounters]', N'U') IS NOT NULL
               AND COL_LENGTH('LaunchOfferCounters', 'ViralProjectCourseId') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1 FROM sys.foreign_keys
                    WHERE name = 'FK_LaunchOfferCounters_Courses_ViralProjectCourseId')
                ALTER TABLE [LaunchOfferCounters]
                ADD CONSTRAINT [FK_LaunchOfferCounters_Courses_ViralProjectCourseId]
                    FOREIGN KEY ([ViralProjectCourseId]) REFERENCES [Courses] ([Id]);

            IF OBJECT_ID(N'[LaunchOfferCounters]', N'U') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = 'IX_LaunchOfferCounters_ViralProjectCourseId'
                      AND object_id = OBJECT_ID('LaunchOfferCounters'))
                CREATE INDEX [IX_LaunchOfferCounters_ViralProjectCourseId]
                    ON [LaunchOfferCounters] ([ViralProjectCourseId]);
            """,
            cancellationToken);

        var ready = await db.Database
            .SqlQueryRaw<int>(
                """
                SELECT CASE
                    WHEN OBJECT_ID(N'[LaunchMemberships]', N'U') IS NOT NULL
                    THEN 1 ELSE 0 END AS [Value]
                """)
            .FirstAsync(cancellationToken);

        if (ready == 1)
            return;

        await db.Database.ExecuteSqlRawAsync(
            """
            IF OBJECT_ID(N'[LaunchMemberships]', N'U') IS NULL
            BEGIN
                CREATE TABLE [LaunchMemberships] (
                    [Id] uniqueidentifier NOT NULL,
                    [CustomerId] uniqueidentifier NOT NULL,
                    [CourseId] uniqueidentifier NOT NULL,
                    [OrderId] uniqueidentifier NOT NULL,
                    [OrderItemId] uniqueidentifier NOT NULL,
                    [MemberNumber] int NOT NULL,
                    [ViralProjectCourseId] uniqueidentifier NULL,
                    [AccessStartDate] datetime2 NOT NULL,
                    [AccessExpiryDate] datetime2 NOT NULL,
                    [BadgeGrantedAt] datetime2 NOT NULL,
                    [CreatedAt] datetime2 NOT NULL,
                    [UpdatedAt] datetime2 NOT NULL,
                    CONSTRAINT [PK_LaunchMemberships] PRIMARY KEY ([Id]),
                    CONSTRAINT [FK_LaunchMemberships_Customers_CustomerId]
                        FOREIGN KEY ([CustomerId]) REFERENCES [Customers] ([Id]) ON DELETE NO ACTION,
                    CONSTRAINT [FK_LaunchMemberships_Courses_CourseId]
                        FOREIGN KEY ([CourseId]) REFERENCES [Courses] ([Id]) ON DELETE NO ACTION,
                    CONSTRAINT [FK_LaunchMemberships_Courses_ViralProjectCourseId]
                        FOREIGN KEY ([ViralProjectCourseId]) REFERENCES [Courses] ([Id]) ON DELETE SET NULL,
                    CONSTRAINT [FK_LaunchMemberships_Orders_OrderId]
                        FOREIGN KEY ([OrderId]) REFERENCES [Orders] ([Id]) ON DELETE NO ACTION,
                    CONSTRAINT [FK_LaunchMemberships_OrderItems_OrderItemId]
                        FOREIGN KEY ([OrderItemId]) REFERENCES [OrderItems] ([Id]) ON DELETE NO ACTION
                );
                CREATE UNIQUE INDEX [IX_LaunchMemberships_CourseId_MemberNumber] ON [LaunchMemberships] ([CourseId], [MemberNumber]);
                CREATE UNIQUE INDEX [IX_LaunchMemberships_OrderItemId] ON [LaunchMemberships] ([OrderItemId]);
                CREATE INDEX [IX_LaunchMemberships_CustomerId] ON [LaunchMemberships] ([CustomerId]);
                CREATE INDEX [IX_LaunchMemberships_OrderId] ON [LaunchMemberships] ([OrderId]);
                CREATE INDEX [IX_LaunchMemberships_ViralProjectCourseId] ON [LaunchMemberships] ([ViralProjectCourseId]);
            END
            """,
            cancellationToken);

        // Record migration so EF history stays consistent when present.
        await db.Database.ExecuteSqlRawAsync(
            """
            IF OBJECT_ID(N'[__EFMigrationsHistory]', N'U') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1 FROM [__EFMigrationsHistory]
                    WHERE [MigrationId] = N'20260928120446_AddLaunchMembership')
            BEGIN
                INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
                VALUES (N'20260928120446_AddLaunchMembership', N'10.0.0');
            END
            """,
            cancellationToken);
    }
}
