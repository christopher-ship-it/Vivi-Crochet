namespace VIVI.Infrastructure.Data;

/// <summary>
/// DDL for student codes, shared by the migration and the startup bootstrapper (production runs with
/// AutoMigrate off, so the bootstrapper is what applies it there). Every statement is idempotent and is
/// run as its own batch, because later statements use columns/tables the earlier ones create.
/// </summary>
public static class StudentOfferSchemaSql
{
    public static readonly string[] Up =
    [
        """
        IF OBJECT_ID(N'[StudentCodes]', N'U') IS NULL
        BEGIN
            CREATE TABLE [StudentCodes] (
                [Id] uniqueidentifier NOT NULL,
                [Code] nvarchar(40) NOT NULL,
                [Label] nvarchar(120) NOT NULL,
                [IsActive] bit NOT NULL,
                [MaxUses] int NULL,
                [UsedCount] int NOT NULL,
                [ExpiresAt] datetime2 NULL,
                [CreatedAt] datetime2 NOT NULL,
                [UpdatedAt] datetime2 NOT NULL,
                CONSTRAINT [PK_StudentCodes] PRIMARY KEY ([Id])
            );
        END
        """,
        """
        IF OBJECT_ID(N'[StudentCodes]', N'U') IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM sys.indexes
                           WHERE name = N'IX_StudentCodes_Code' AND object_id = OBJECT_ID(N'[StudentCodes]'))
            CREATE UNIQUE INDEX [IX_StudentCodes_Code] ON [StudentCodes] ([Code]);
        """,
        """
        IF OBJECT_ID(N'[LaunchOfferCounters]', N'U') IS NOT NULL
           AND COL_LENGTH('LaunchOfferCounters', 'StudentPrice') IS NULL
            ALTER TABLE [LaunchOfferCounters]
            ADD [StudentPrice] int NOT NULL CONSTRAINT [DF_LaunchOfferCounters_StudentPrice] DEFAULT 999;
        """,
        """
        IF OBJECT_ID(N'[LaunchOfferCounters]', N'U') IS NOT NULL
           AND COL_LENGTH('LaunchOfferCounters', 'StudentCompletedCount') IS NULL
            ALTER TABLE [LaunchOfferCounters]
            ADD [StudentCompletedCount] int NOT NULL CONSTRAINT [DF_LaunchOfferCounters_StudentCompletedCount] DEFAULT 0;
        """,
        """
        IF OBJECT_ID(N'[OrderItems]', N'U') IS NOT NULL
           AND COL_LENGTH('OrderItems', 'StudentCodeId') IS NULL
            ALTER TABLE [OrderItems] ADD [StudentCodeId] uniqueidentifier NULL;
        """,
        """
        IF COL_LENGTH('OrderItems', 'StudentCodeId') IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_OrderItems_StudentCodes_StudentCodeId')
            ALTER TABLE [OrderItems] ADD CONSTRAINT [FK_OrderItems_StudentCodes_StudentCodeId]
                FOREIGN KEY ([StudentCodeId]) REFERENCES [StudentCodes] ([Id]);
        """,
        """
        IF COL_LENGTH('OrderItems', 'StudentCodeId') IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM sys.indexes
                           WHERE name = N'IX_OrderItems_StudentCodeId' AND object_id = OBJECT_ID(N'[OrderItems]'))
            CREATE INDEX [IX_OrderItems_StudentCodeId] ON [OrderItems] ([StudentCodeId]);
        """,
        """
        IF OBJECT_ID(N'[LaunchMemberships]', N'U') IS NOT NULL
           AND COL_LENGTH('LaunchMemberships', 'IsStudent') IS NULL
            ALTER TABLE [LaunchMemberships]
            ADD [IsStudent] bit NOT NULL CONSTRAINT [DF_LaunchMemberships_IsStudent] DEFAULT CAST(0 AS bit);
        """,
        """
        IF OBJECT_ID(N'[LaunchMemberships]', N'U') IS NOT NULL
           AND COL_LENGTH('LaunchMemberships', 'StudentCodeId') IS NULL
            ALTER TABLE [LaunchMemberships] ADD [StudentCodeId] uniqueidentifier NULL;
        """,
        """
        IF COL_LENGTH('LaunchMemberships', 'StudentCodeId') IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_LaunchMemberships_StudentCodes_StudentCodeId')
            ALTER TABLE [LaunchMemberships] ADD CONSTRAINT [FK_LaunchMemberships_StudentCodes_StudentCodeId]
                FOREIGN KEY ([StudentCodeId]) REFERENCES [StudentCodes] ([Id]);
        """,
        """
        IF COL_LENGTH('LaunchMemberships', 'StudentCodeId') IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM sys.indexes
                           WHERE name = N'IX_LaunchMemberships_StudentCodeId' AND object_id = OBJECT_ID(N'[LaunchMemberships]'))
            CREATE INDEX [IX_LaunchMemberships_StudentCodeId] ON [LaunchMemberships] ([StudentCodeId]);
        """,
        """
        IF OBJECT_ID(N'[CoursePrices]', N'U') IS NOT NULL
           AND COL_LENGTH('CoursePrices', 'StudentPrice') IS NULL
            ALTER TABLE [CoursePrices] ADD [StudentPrice] decimal(12,2) NULL;
        """,
        // Students have their own number series, so the unique number now includes IsStudent.
        """
        IF COL_LENGTH('LaunchMemberships', 'IsStudent') IS NOT NULL
           AND EXISTS (SELECT 1 FROM sys.indexes
                       WHERE name = N'IX_LaunchMemberships_CourseId_MemberNumber'
                         AND object_id = OBJECT_ID(N'[LaunchMemberships]'))
            DROP INDEX [IX_LaunchMemberships_CourseId_MemberNumber] ON [LaunchMemberships];
        """,
        """
        IF COL_LENGTH('LaunchMemberships', 'IsStudent') IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM sys.indexes
                           WHERE name = N'IX_LaunchMemberships_CourseId_IsStudent_MemberNumber'
                             AND object_id = OBJECT_ID(N'[LaunchMemberships]'))
            CREATE UNIQUE INDEX [IX_LaunchMemberships_CourseId_IsStudent_MemberNumber]
                ON [LaunchMemberships] ([CourseId], [IsStudent], [MemberNumber]);
        """
    ];
}
