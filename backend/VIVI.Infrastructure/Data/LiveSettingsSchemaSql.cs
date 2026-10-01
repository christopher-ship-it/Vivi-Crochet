namespace VIVI.Infrastructure.Data;

/// <summary>
/// Idempotent DDL for admin-editable Live settings, shared by the EF migration and
/// LiveSchemaBootstrapper (production runs with AutoMigrate=false).
/// </summary>
public static class LiveSettingsSchemaSql
{
    public const string Ddl = """
        IF OBJECT_ID(N'[LiveSettings]', N'U') IS NULL
            CREATE TABLE [LiveSettings] (
                [Id] uniqueidentifier NOT NULL,
                [PackagePrice] decimal(18,2) NOT NULL,
                [HoursPerClassDay] int NOT NULL,
                [Language] nvarchar(40) NOT NULL,
                [Level] nvarchar(40) NOT NULL,
                [UpdatedAt] datetime2 NOT NULL,
                CONSTRAINT [PK_LiveSettings] PRIMARY KEY ([Id])
            );

        IF OBJECT_ID(N'[LiveSessionDefinitions]', N'U') IS NULL
            CREATE TABLE [LiveSessionDefinitions] (
                [Id] uniqueidentifier NOT NULL,
                [SlotType] int NOT NULL,
                [Name] nvarchar(100) NOT NULL,
                [Hours] nvarchar(60) NOT NULL,
                [IsEnabled] bit NOT NULL,
                [UpdatedAt] datetime2 NOT NULL,
                CONSTRAINT [PK_LiveSessionDefinitions] PRIMARY KEY ([Id])
            );

        IF OBJECT_ID(N'[LiveSessionDefinitions]', N'U') IS NOT NULL
           AND NOT EXISTS (
                SELECT 1 FROM sys.indexes
                WHERE name = N'IX_LiveSessionDefinitions_SlotType'
                  AND object_id = OBJECT_ID(N'[LiveSessionDefinitions]'))
            CREATE UNIQUE INDEX [IX_LiveSessionDefinitions_SlotType]
                ON [LiveSessionDefinitions] ([SlotType]);

        IF OBJECT_ID(N'[LiveWeeks]', N'U') IS NOT NULL
           AND COL_LENGTH('LiveWeeks', 'PriceOverride') IS NULL
            ALTER TABLE [LiveWeeks] ADD [PriceOverride] decimal(18,2) NULL;

        IF OBJECT_ID(N'[LiveWeeks]', N'U') IS NOT NULL
           AND COL_LENGTH('LiveWeeks', 'LanguageOverride') IS NULL
            ALTER TABLE [LiveWeeks] ADD [LanguageOverride] nvarchar(40) NULL;

        IF OBJECT_ID(N'[LiveWeeks]', N'U') IS NOT NULL
           AND COL_LENGTH('LiveWeeks', 'LevelOverride') IS NULL
            ALTER TABLE [LiveWeeks] ADD [LevelOverride] nvarchar(40) NULL;

        IF OBJECT_ID(N'[LiveWeekSlots]', N'U') IS NOT NULL
           AND COL_LENGTH('LiveWeekSlots', 'HoursOverride') IS NULL
            ALTER TABLE [LiveWeekSlots] ADD [HoursOverride] nvarchar(60) NULL;
        """;
}
