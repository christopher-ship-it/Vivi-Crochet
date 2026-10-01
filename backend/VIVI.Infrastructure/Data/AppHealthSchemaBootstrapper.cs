using Microsoft.EntityFrameworkCore;

namespace VIVI.Infrastructure.Data;

/// <summary>
/// Ensures the App health tables exist when AutoMigrate is false
/// (same recovery pattern as PushSchemaBootstrapper).
/// </summary>
public static class AppHealthSchemaBootstrapper
{
    public static async Task EnsureAsync(ViviDbContext db, CancellationToken cancellationToken)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            IF OBJECT_ID(N'[AppIssues]', N'U') IS NULL
            BEGIN
                CREATE TABLE [AppIssues] (
                    [Id] uniqueidentifier NOT NULL,
                    [UserId] uniqueidentifier NULL,
                    [Kind] nvarchar(16) NOT NULL,
                    [Title] nvarchar(300) NOT NULL,
                    [Details] nvarchar(max) NULL,
                    [Screen] nvarchar(200) NULL,
                    [AppVersion] nvarchar(40) NULL,
                    [Platform] nvarchar(40) NULL,
                    [DeviceInfo] nvarchar(300) NULL,
                    [IsFatal] bit NOT NULL CONSTRAINT [DF_AppIssues_IsFatal] DEFAULT (0),
                    [CreatedAt] datetime2 NOT NULL,
                    [IsResolved] bit NOT NULL CONSTRAINT [DF_AppIssues_IsResolved] DEFAULT (0),
                    [ResolvedAt] datetime2 NULL,
                    CONSTRAINT [PK_AppIssues] PRIMARY KEY ([Id])
                );
            END
            """,
            cancellationToken);

        await db.Database.ExecuteSqlRawAsync(
            """
            IF OBJECT_ID(N'[AppIssues]', N'U') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'IX_AppIssues_CreatedAt'
                      AND object_id = OBJECT_ID(N'[AppIssues]'))
                CREATE INDEX [IX_AppIssues_CreatedAt] ON [AppIssues] ([CreatedAt]);
            """,
            cancellationToken);

        await db.Database.ExecuteSqlRawAsync(
            """
            IF OBJECT_ID(N'[AppIssues]', N'U') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'IX_AppIssues_Kind_IsResolved'
                      AND object_id = OBJECT_ID(N'[AppIssues]'))
                CREATE INDEX [IX_AppIssues_Kind_IsResolved] ON [AppIssues] ([Kind], [IsResolved]);
            """,
            cancellationToken);

        await db.Database.ExecuteSqlRawAsync(
            """
            IF OBJECT_ID(N'[ScreenTapCells]', N'U') IS NULL
            BEGIN
                CREATE TABLE [ScreenTapCells] (
                    [Id] uniqueidentifier NOT NULL,
                    [Screen] nvarchar(200) NOT NULL,
                    [Col] int NOT NULL,
                    [Row] int NOT NULL,
                    [Taps] bigint NOT NULL,
                    [UpdatedAt] datetime2 NOT NULL,
                    CONSTRAINT [PK_ScreenTapCells] PRIMARY KEY ([Id])
                );
            END
            """,
            cancellationToken);

        await db.Database.ExecuteSqlRawAsync(
            """
            IF OBJECT_ID(N'[ScreenTapCells]', N'U') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'IX_ScreenTapCells_Screen_Col_Row'
                      AND object_id = OBJECT_ID(N'[ScreenTapCells]'))
                CREATE UNIQUE INDEX [IX_ScreenTapCells_Screen_Col_Row]
                    ON [ScreenTapCells] ([Screen], [Col], [Row]);
            """,
            cancellationToken);
    }
}
