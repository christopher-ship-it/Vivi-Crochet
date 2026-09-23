using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCustomerEmailAuthAndProfile : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Idempotent: previous apply may have dropped indexes / added columns
            // before failing on duplicate emails.
            migrationBuilder.Sql(@"
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Customers_Email' AND object_id = OBJECT_ID(N'dbo.Customers'))
    DROP INDEX [IX_Customers_Email] ON [Customers];

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Customers_PhoneNumber' AND object_id = OBJECT_ID(N'dbo.Customers'))
    DROP INDEX [IX_Customers_PhoneNumber] ON [Customers];

IF COL_LENGTH('dbo.Customers', 'ShipCountry') IS NOT NULL
    ALTER TABLE [Customers] ALTER COLUMN [ShipCountry] nvarchar(80) NULL;

IF COL_LENGTH('dbo.Customers', 'PhoneNumber') IS NOT NULL
    ALTER TABLE [Customers] ALTER COLUMN [PhoneNumber] nvarchar(10) NULL;

IF COL_LENGTH('dbo.Customers', 'Age') IS NULL
    ALTER TABLE [Customers] ADD [Age] int NULL;

IF COL_LENGTH('dbo.Customers', 'AuthMethod') IS NULL
    ALTER TABLE [Customers] ADD [AuthMethod] int NOT NULL CONSTRAINT [DF_Customers_AuthMethod] DEFAULT 0;

IF COL_LENGTH('dbo.Customers', 'City') IS NULL
    ALTER TABLE [Customers] ADD [City] nvarchar(80) NULL;

IF COL_LENGTH('dbo.Customers', 'Country') IS NULL
    ALTER TABLE [Customers] ADD [Country] nvarchar(80) NULL;

IF COL_LENGTH('dbo.Customers', 'State') IS NULL
    ALTER TABLE [Customers] ADD [State] nvarchar(80) NULL;

-- Keep the newest row per email; rename older duplicates so the unique index can apply.
;WITH EmailRanked AS (
    SELECT [Id],
           ROW_NUMBER() OVER (
               PARTITION BY LOWER([Email])
               ORDER BY [UpdatedAt] DESC, [CreatedAt] DESC, [Id] DESC
           ) AS [rn]
    FROM [Customers]
    WHERE [Email] IS NOT NULL AND LTRIM(RTRIM([Email])) <> N''
)
UPDATE c
SET [Email] = N'dup.' + CONVERT(nvarchar(36), c.[Id])
FROM [Customers] c
INNER JOIN EmailRanked r ON c.[Id] = r.[Id]
WHERE r.[rn] > 1;

-- Keep the newest row per phone; clear older duplicates (nullable).
;WITH PhoneRanked AS (
    SELECT [Id],
           ROW_NUMBER() OVER (
               PARTITION BY [PhoneNumber]
               ORDER BY [UpdatedAt] DESC, [CreatedAt] DESC, [Id] DESC
           ) AS [rn]
    FROM [Customers]
    WHERE [PhoneNumber] IS NOT NULL AND LTRIM(RTRIM([PhoneNumber])) <> N''
)
UPDATE c
SET [PhoneNumber] = NULL
FROM [Customers] c
INNER JOIN PhoneRanked r ON c.[Id] = r.[Id]
WHERE r.[rn] > 1;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Customers_Email' AND object_id = OBJECT_ID(N'dbo.Customers'))
    CREATE UNIQUE INDEX [IX_Customers_Email] ON [Customers] ([Email]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Customers_PhoneNumber' AND object_id = OBJECT_ID(N'dbo.Customers'))
    CREATE UNIQUE INDEX [IX_Customers_PhoneNumber] ON [Customers] ([PhoneNumber]) WHERE [PhoneNumber] IS NOT NULL;
");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Customers_Email' AND object_id = OBJECT_ID(N'dbo.Customers'))
    DROP INDEX [IX_Customers_Email] ON [Customers];

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Customers_PhoneNumber' AND object_id = OBJECT_ID(N'dbo.Customers'))
    DROP INDEX [IX_Customers_PhoneNumber] ON [Customers];

IF COL_LENGTH('dbo.Customers', 'Age') IS NOT NULL
    ALTER TABLE [Customers] DROP COLUMN [Age];

IF COL_LENGTH('dbo.Customers', 'AuthMethod') IS NOT NULL
BEGIN
    DECLARE @df sysname;
    SELECT @df = d.name
    FROM sys.default_constraints d
    INNER JOIN sys.columns c ON d.parent_object_id = c.object_id AND d.parent_column_id = c.column_id
    WHERE d.parent_object_id = OBJECT_ID(N'dbo.Customers') AND c.name = N'AuthMethod';
    IF @df IS NOT NULL EXEC(N'ALTER TABLE [Customers] DROP CONSTRAINT [' + @df + N']');
    ALTER TABLE [Customers] DROP COLUMN [AuthMethod];
END

IF COL_LENGTH('dbo.Customers', 'City') IS NOT NULL
    ALTER TABLE [Customers] DROP COLUMN [City];

IF COL_LENGTH('dbo.Customers', 'Country') IS NOT NULL
    ALTER TABLE [Customers] DROP COLUMN [Country];

IF COL_LENGTH('dbo.Customers', 'State') IS NOT NULL
    ALTER TABLE [Customers] DROP COLUMN [State];

IF COL_LENGTH('dbo.Customers', 'ShipCountry') IS NOT NULL
    ALTER TABLE [Customers] ALTER COLUMN [ShipCountry] nvarchar(40) NULL;

IF COL_LENGTH('dbo.Customers', 'PhoneNumber') IS NOT NULL
    ALTER TABLE [Customers] ALTER COLUMN [PhoneNumber] nvarchar(10) NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Customers_Email' AND object_id = OBJECT_ID(N'dbo.Customers'))
    CREATE INDEX [IX_Customers_Email] ON [Customers] ([Email]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Customers_PhoneNumber' AND object_id = OBJECT_ID(N'dbo.Customers'))
    CREATE UNIQUE INDEX [IX_Customers_PhoneNumber] ON [Customers] ([PhoneNumber]);
");
        }
    }
}
