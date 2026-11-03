namespace VIVI.Infrastructure.Data;

/// <summary>
/// Idempotent DDL for Live courses, shared by the EF migration and LiveSchemaBootstrapper
/// (production runs with AutoMigrate=false).
/// </summary>
public static class LiveCourseSchemaSql
{
    public const string Ddl = """
        IF OBJECT_ID(N'[LiveCourses]', N'U') IS NULL
            CREATE TABLE [LiveCourses] (
                [Id] uniqueidentifier NOT NULL,
                [Code] nvarchar(40) NOT NULL,
                [Name] nvarchar(80) NOT NULL,
                [Level] nvarchar(40) NOT NULL,
                [Tagline] nvarchar(120) NOT NULL,
                [Price] decimal(18,2) NOT NULL,
                [DurationDays] int NOT NULL,
                [HoursPerDay] int NOT NULL,
                [WeeksSpan] int NOT NULL,
                [IsBundle] bit NOT NULL,
                [IsActive] bit NOT NULL,
                [SortOrder] int NOT NULL,
                [LearnJson] nvarchar(max) NOT NULL,
                [ProjectsJson] nvarchar(max) NOT NULL,
                [UpdatedAt] datetime2 NOT NULL,
                CONSTRAINT [PK_LiveCourses] PRIMARY KEY ([Id])
            );

        IF OBJECT_ID(N'[LiveCourses]', N'U') IS NOT NULL
           AND NOT EXISTS (
                SELECT 1 FROM sys.indexes
                WHERE name = N'IX_LiveCourses_Code'
                  AND object_id = OBJECT_ID(N'[LiveCourses]'))
            CREATE UNIQUE INDEX [IX_LiveCourses_Code] ON [LiveCourses] ([Code]);

        -- Existing studios start on the official business WhatsApp number; the admin can change it.
        IF OBJECT_ID(N'[LiveSettings]', N'U') IS NOT NULL
           AND COL_LENGTH('LiveSettings', 'EnquiryWhatsApp') IS NULL
            ALTER TABLE [LiveSettings]
            ADD [EnquiryWhatsApp] nvarchar(20) NOT NULL
                CONSTRAINT [DF_LiveSettings_EnquiryWhatsApp] DEFAULT N'918438034181';

        IF OBJECT_ID(N'[LiveBookings]', N'U') IS NOT NULL
           AND COL_LENGTH('LiveBookings', 'CourseId') IS NULL
            ALTER TABLE [LiveBookings] ADD [CourseId] uniqueidentifier NULL;

        IF OBJECT_ID(N'[LiveBookings]', N'U') IS NOT NULL
           AND COL_LENGTH('LiveBookings', 'WeeksHeld') IS NULL
            ALTER TABLE [LiveBookings]
            ADD [WeeksHeld] int NOT NULL
                CONSTRAINT [DF_LiveBookings_WeeksHeld] DEFAULT 1;
        """;
}
