namespace VIVI.Infrastructure.Data;

/// <summary>DDL for the IntroVideos table, shared by the migration and the startup bootstrapper.</summary>
public static class IntroVideoSchemaSql
{
    public const string CreateTable = """
        IF OBJECT_ID(N'[IntroVideos]', N'U') IS NULL
        BEGIN
            CREATE TABLE [IntroVideos] (
                [Id] uniqueidentifier NOT NULL,
                [IsEnabled] bit NOT NULL,
                [OriginalBlobPath] nvarchar(500) NOT NULL,
                [FileName] nvarchar(260) NOT NULL,
                [FileSizeBytes] bigint NOT NULL,
                [ContentType] nvarchar(100) NOT NULL,
                [BlobPath] nvarchar(500) NOT NULL,
                [PlayableFileSizeBytes] bigint NULL,
                [TranscodeStatus] int NOT NULL,
                [TranscodeError] nvarchar(1000) NULL,
                [UploadConfirmed] bit NOT NULL,
                [Version] int NOT NULL,
                [CreatedAt] datetime2 NOT NULL,
                [UpdatedAt] datetime2 NOT NULL,
                CONSTRAINT [PK_IntroVideos] PRIMARY KEY ([Id])
            );
        END
        """;
}
