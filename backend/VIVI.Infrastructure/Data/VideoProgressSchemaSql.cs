namespace VIVI.Infrastructure.Data;

/// <summary>
/// DDL for the VideoProgress table, shared by the migration and the startup bootstrapper
/// (production runs with AutoMigrate off, so the bootstrapper is what creates it there).
/// </summary>
public static class VideoProgressSchemaSql
{
    public const string CreateTable = """
        IF OBJECT_ID(N'[VideoProgress]', N'U') IS NULL
        BEGIN
            CREATE TABLE [VideoProgress] (
                [Id] uniqueidentifier NOT NULL,
                [CustomerId] uniqueidentifier NOT NULL,
                [CourseId] uniqueidentifier NOT NULL,
                [VideoId] uniqueidentifier NOT NULL,
                [PositionSeconds] int NOT NULL,
                [DurationSeconds] int NOT NULL,
                [IsCompleted] bit NOT NULL,
                [UpdatedAt] datetime2 NOT NULL,
                CONSTRAINT [PK_VideoProgress] PRIMARY KEY ([Id]),
                CONSTRAINT [FK_VideoProgress_Customers_CustomerId] FOREIGN KEY ([CustomerId])
                    REFERENCES [Customers] ([Id]) ON DELETE CASCADE,
                CONSTRAINT [FK_VideoProgress_Videos_VideoId] FOREIGN KEY ([VideoId])
                    REFERENCES [Videos] ([Id]) ON DELETE CASCADE
            );
        END
        """;

    public const string CreateUniqueIndex = """
        IF OBJECT_ID(N'[VideoProgress]', N'U') IS NOT NULL
           AND NOT EXISTS (
                SELECT 1 FROM sys.indexes
                WHERE name = N'IX_VideoProgress_CustomerId_VideoId'
                  AND object_id = OBJECT_ID(N'[VideoProgress]'))
            CREATE UNIQUE INDEX [IX_VideoProgress_CustomerId_VideoId]
                ON [VideoProgress] ([CustomerId], [VideoId]);
        """;

    public const string CreateCourseIndex = """
        IF OBJECT_ID(N'[VideoProgress]', N'U') IS NOT NULL
           AND NOT EXISTS (
                SELECT 1 FROM sys.indexes
                WHERE name = N'IX_VideoProgress_CustomerId_CourseId'
                  AND object_id = OBJECT_ID(N'[VideoProgress]'))
            CREATE INDEX [IX_VideoProgress_CustomerId_CourseId]
                ON [VideoProgress] ([CustomerId], [CourseId]);
        """;

    public const string CreateVideoIndex = """
        IF OBJECT_ID(N'[VideoProgress]', N'U') IS NOT NULL
           AND NOT EXISTS (
                SELECT 1 FROM sys.indexes
                WHERE name = N'IX_VideoProgress_VideoId'
                  AND object_id = OBJECT_ID(N'[VideoProgress]'))
            CREATE INDEX [IX_VideoProgress_VideoId] ON [VideoProgress] ([VideoId]);
        """;

    public const string DropTable = """
        IF OBJECT_ID(N'[VideoProgress]', N'U') IS NOT NULL DROP TABLE [VideoProgress];
        """;
}
