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

        IF OBJECT_ID(N'[LiveCourses]', N'U') IS NOT NULL
           AND COL_LENGTH('LiveCourses', 'Mrp') IS NULL
        BEGIN
            ALTER TABLE [LiveCourses] ADD [Mrp] decimal(18,2) NULL;
            -- The Artist pack launched at 4999; it is now 4499 with 4999 struck through (10% off).
            -- Dynamic SQL because the new column cannot be used in the batch that adds it.
            EXEC(N'UPDATE [LiveCourses] SET [Mrp] = 4999, [Price] = 4499
                   WHERE [Code] = N''artist-pack'' AND [Price] = 4999');
        END

        IF OBJECT_ID(N'[LiveEnquiries]', N'U') IS NULL
            CREATE TABLE [LiveEnquiries] (
                [Id] uniqueidentifier NOT NULL,
                [Name] nvarchar(120) NOT NULL,
                [Email] nvarchar(200) NOT NULL,
                [Phone] nvarchar(30) NULL,
                [CourseId] uniqueidentifier NULL,
                [CourseName] nvarchar(80) NOT NULL,
                [Price] decimal(18,2) NOT NULL,
                [WeekId] uniqueidentifier NOT NULL,
                [WeekNumber] int NOT NULL,
                [StartDate] date NOT NULL,
                [EndDate] date NOT NULL,
                [WeeksHeld] int NOT NULL,
                [SlotName] nvarchar(100) NOT NULL,
                [SlotHours] nvarchar(60) NOT NULL,
                [PaymentReference] nvarchar(120) NOT NULL,
                [SentAt] datetime2 NULL,
                [CreatedAt] datetime2 NOT NULL,
                CONSTRAINT [PK_LiveEnquiries] PRIMARY KEY ([Id])
            );

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
