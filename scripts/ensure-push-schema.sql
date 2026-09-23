-- Run in Azure SQL (Portal query editor or SSMS) if admin orders/notifications 500.
-- Safe to re-run. This unblocks Orders immediately (Customer columns EF expects).

IF COL_LENGTH('Customers', 'OnboardingPushesSentAt') IS NULL
    ALTER TABLE [Customers] ADD [OnboardingPushesSentAt] datetime2 NULL;

IF COL_LENGTH('Customers', 'LastWeeklyPushAt') IS NULL
    ALTER TABLE [Customers] ADD [LastWeeklyPushAt] datetime2 NULL;

-- Widen PhoneNumber: must drop dependent filtered unique index first.
IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'[Customers]')
      AND name = N'PhoneNumber'
      AND max_length < 40)
BEGIN
    IF EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_Customers_PhoneNumber'
          AND object_id = OBJECT_ID(N'[Customers]'))
        DROP INDEX [IX_Customers_PhoneNumber] ON [Customers];

    ALTER TABLE [Customers] ALTER COLUMN [PhoneNumber] nvarchar(20) NULL;

    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_Customers_PhoneNumber'
          AND object_id = OBJECT_ID(N'[Customers]'))
        CREATE UNIQUE INDEX [IX_Customers_PhoneNumber]
            ON [Customers] ([PhoneNumber])
            WHERE [PhoneNumber] IS NOT NULL;
END

IF OBJECT_ID(N'[DevicePushTokens]', N'U') IS NULL
BEGIN
    CREATE TABLE [DevicePushTokens] (
        [Id] uniqueidentifier NOT NULL,
        [CustomerId] uniqueidentifier NOT NULL,
        [ExpoPushToken] nvarchar(200) NOT NULL,
        [Platform] nvarchar(20) NOT NULL,
        [IsActive] bit NOT NULL CONSTRAINT [DF_DevicePushTokens_IsActive] DEFAULT (1),
        [CreatedAt] datetime2 NOT NULL,
        [UpdatedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_DevicePushTokens] PRIMARY KEY ([Id])
    );
END

IF OBJECT_ID(N'[DevicePushTokens]', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_DevicePushTokens_ExpoPushToken'
          AND object_id = OBJECT_ID(N'[DevicePushTokens]'))
    CREATE UNIQUE INDEX [IX_DevicePushTokens_ExpoPushToken]
        ON [DevicePushTokens] ([ExpoPushToken]);

IF OBJECT_ID(N'[DevicePushTokens]', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_DevicePushTokens_CustomerId'
          AND object_id = OBJECT_ID(N'[DevicePushTokens]'))
    CREATE INDEX [IX_DevicePushTokens_CustomerId]
        ON [DevicePushTokens] ([CustomerId]);

IF OBJECT_ID(N'[DevicePushTokens]', N'U') IS NOT NULL
   AND OBJECT_ID(N'[Customers]', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.foreign_keys
        WHERE name = N'FK_DevicePushTokens_Customers_CustomerId')
    ALTER TABLE [DevicePushTokens] WITH CHECK
    ADD CONSTRAINT [FK_DevicePushTokens_Customers_CustomerId]
        FOREIGN KEY ([CustomerId]) REFERENCES [Customers] ([Id]) ON DELETE CASCADE;
