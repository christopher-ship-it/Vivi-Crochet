using Microsoft.EntityFrameworkCore;
using VIVI.Infrastructure.Data;

namespace VIVI.Infrastructure.Transcoding;

/// <summary>
/// Ensures video transcode columns exist when AutoMigrate is false.
/// Each statement runs in its own batch — SQL Server compiles a whole batch
/// before execution, so ADD + UPDATE of a new column in one batch fails with
/// "Invalid column name".
/// </summary>
public static class VideoTranscodeSchemaBootstrapper
{
    public static async Task EnsureAsync(ViviDbContext db, CancellationToken cancellationToken)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            IF COL_LENGTH('Videos', 'OriginalBlobPath') IS NULL
                ALTER TABLE [Videos] ADD [OriginalBlobPath] nvarchar(512) NULL;
            """,
            cancellationToken);

        await db.Database.ExecuteSqlRawAsync(
            """
            IF COL_LENGTH('Videos', 'PlayableFileSizeBytes') IS NULL
                ALTER TABLE [Videos] ADD [PlayableFileSizeBytes] bigint NULL;
            """,
            cancellationToken);

        await db.Database.ExecuteSqlRawAsync(
            """
            IF COL_LENGTH('Videos', 'PlayableContentType') IS NULL
                ALTER TABLE [Videos] ADD [PlayableContentType] nvarchar(80) NULL;
            """,
            cancellationToken);

        await db.Database.ExecuteSqlRawAsync(
            """
            IF COL_LENGTH('Videos', 'TranscodeStatus') IS NULL
                ALTER TABLE [Videos] ADD [TranscodeStatus] int NOT NULL
                    CONSTRAINT [DF_Videos_TranscodeStatus] DEFAULT (0);
            """,
            cancellationToken);

        await db.Database.ExecuteSqlRawAsync(
            """
            IF COL_LENGTH('Videos', 'TranscodeError') IS NULL
                ALTER TABLE [Videos] ADD [TranscodeError] nvarchar(1000) NULL;
            """,
            cancellationToken);

        await db.Database.ExecuteSqlRawAsync(
            """
            UPDATE [Videos]
            SET [OriginalBlobPath] = [BlobPath]
            WHERE [OriginalBlobPath] IS NULL OR LTRIM(RTRIM([OriginalBlobPath])) = '';
            """,
            cancellationToken);

        await db.Database.ExecuteSqlRawAsync(
            """
            UPDATE [Videos]
            SET [TranscodeStatus] = 3
            WHERE [UploadConfirmed] = 1 AND [TranscodeStatus] = 0;
            """,
            cancellationToken);

        await db.Database.ExecuteSqlRawAsync(
            """
            IF COL_LENGTH('Videos', 'OriginalBlobPath') IS NOT NULL
               AND EXISTS (
                    SELECT 1 FROM sys.columns
                    WHERE object_id = OBJECT_ID(N'[Videos]')
                      AND name = N'OriginalBlobPath'
                      AND is_nullable = 1)
                ALTER TABLE [Videos] ALTER COLUMN [OriginalBlobPath] nvarchar(512) NOT NULL;
            """,
            cancellationToken);

        await db.Database.ExecuteSqlRawAsync(
            """
            IF NOT EXISTS (
                SELECT 1 FROM sys.indexes
                WHERE name = N'IX_Videos_TranscodeStatus' AND object_id = OBJECT_ID(N'[Videos]')
            )
                CREATE INDEX [IX_Videos_TranscodeStatus] ON [Videos] ([TranscodeStatus]);
            """,
            cancellationToken);
    }
}
