using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VIVI.Infrastructure.Data;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

[DbContext(typeof(ViviDbContext))]
[Migration("20260918140000_AddVideoTranscodeFields")]
public sealed class AddVideoTranscodeFields : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Separate Sql() calls so SQL Server does not compile UPDATE against
        // columns that are only added earlier in the same batch.
        migrationBuilder.Sql("""
            IF COL_LENGTH('Videos', 'OriginalBlobPath') IS NULL
                ALTER TABLE [Videos] ADD [OriginalBlobPath] nvarchar(512) NULL;
            """);

        migrationBuilder.Sql("""
            IF COL_LENGTH('Videos', 'PlayableFileSizeBytes') IS NULL
                ALTER TABLE [Videos] ADD [PlayableFileSizeBytes] bigint NULL;
            """);

        migrationBuilder.Sql("""
            IF COL_LENGTH('Videos', 'PlayableContentType') IS NULL
                ALTER TABLE [Videos] ADD [PlayableContentType] nvarchar(80) NULL;
            """);

        migrationBuilder.Sql("""
            IF COL_LENGTH('Videos', 'TranscodeStatus') IS NULL
                ALTER TABLE [Videos] ADD [TranscodeStatus] int NOT NULL
                    CONSTRAINT [DF_Videos_TranscodeStatus] DEFAULT (0);
            """);

        migrationBuilder.Sql("""
            IF COL_LENGTH('Videos', 'TranscodeError') IS NULL
                ALTER TABLE [Videos] ADD [TranscodeError] nvarchar(1000) NULL;
            """);

        migrationBuilder.Sql("""
            UPDATE [Videos]
            SET [OriginalBlobPath] = [BlobPath]
            WHERE [OriginalBlobPath] IS NULL OR LTRIM(RTRIM([OriginalBlobPath])) = '';
            """);

        migrationBuilder.Sql("""
            UPDATE [Videos]
            SET [TranscodeStatus] = 3
            WHERE [UploadConfirmed] = 1 AND [TranscodeStatus] = 0;
            """);

        migrationBuilder.Sql("""
            IF COL_LENGTH('Videos', 'OriginalBlobPath') IS NOT NULL
               AND EXISTS (
                    SELECT 1 FROM sys.columns
                    WHERE object_id = OBJECT_ID(N'[Videos]')
                      AND name = N'OriginalBlobPath'
                      AND is_nullable = 1)
                ALTER TABLE [Videos] ALTER COLUMN [OriginalBlobPath] nvarchar(512) NOT NULL;
            """);

        migrationBuilder.Sql("""
            IF NOT EXISTS (
                SELECT 1 FROM sys.indexes
                WHERE name = N'IX_Videos_TranscodeStatus' AND object_id = OBJECT_ID(N'[Videos]')
            )
                CREATE INDEX [IX_Videos_TranscodeStatus] ON [Videos] ([TranscodeStatus]);
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF EXISTS (
                SELECT 1 FROM sys.indexes
                WHERE name = N'IX_Videos_TranscodeStatus' AND object_id = OBJECT_ID(N'[Videos]')
            )
                DROP INDEX [IX_Videos_TranscodeStatus] ON [Videos];
            """);

        migrationBuilder.Sql("""
            IF COL_LENGTH('Videos', 'TranscodeError') IS NOT NULL
                ALTER TABLE [Videos] DROP COLUMN [TranscodeError];
            """);

        migrationBuilder.Sql("""
            IF COL_LENGTH('Videos', 'TranscodeStatus') IS NOT NULL
            BEGIN
                DECLARE @df sysname;
                SELECT @df = d.name
                FROM sys.default_constraints d
                JOIN sys.columns c ON c.default_object_id = d.object_id
                WHERE d.parent_object_id = OBJECT_ID(N'[Videos]') AND c.name = N'TranscodeStatus';
                IF @df IS NOT NULL EXEC(N'ALTER TABLE [Videos] DROP CONSTRAINT [' + @df + N']');
                ALTER TABLE [Videos] DROP COLUMN [TranscodeStatus];
            END
            """);

        migrationBuilder.Sql("""
            IF COL_LENGTH('Videos', 'PlayableContentType') IS NOT NULL
                ALTER TABLE [Videos] DROP COLUMN [PlayableContentType];
            """);

        migrationBuilder.Sql("""
            IF COL_LENGTH('Videos', 'PlayableFileSizeBytes') IS NOT NULL
                ALTER TABLE [Videos] DROP COLUMN [PlayableFileSizeBytes];
            """);

        migrationBuilder.Sql("""
            IF COL_LENGTH('Videos', 'OriginalBlobPath') IS NOT NULL
                ALTER TABLE [Videos] DROP COLUMN [OriginalBlobPath];
            """);
    }
}
