using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VIVI.Infrastructure.Data;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

[DbContext(typeof(ViviDbContext))]
[Migration("20260916150000_AddDevicePushTokens")]
public sealed class AddDevicePushTokens : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF COL_LENGTH('Customers', 'OnboardingPushesSentAt') IS NULL
                ALTER TABLE [Customers] ADD [OnboardingPushesSentAt] datetime2 NULL;

            IF COL_LENGTH('Customers', 'LastWeeklyPushAt') IS NULL
                ALTER TABLE [Customers] ADD [LastWeeklyPushAt] datetime2 NULL;

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
                    CONSTRAINT [PK_DevicePushTokens] PRIMARY KEY ([Id]),
                    CONSTRAINT [FK_DevicePushTokens_Customers_CustomerId]
                        FOREIGN KEY ([CustomerId]) REFERENCES [Customers] ([Id]) ON DELETE CASCADE
                );
                CREATE UNIQUE INDEX [IX_DevicePushTokens_ExpoPushToken]
                    ON [DevicePushTokens] ([ExpoPushToken]);
                CREATE INDEX [IX_DevicePushTokens_CustomerId]
                    ON [DevicePushTokens] ([CustomerId]);
            END
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF OBJECT_ID(N'[DevicePushTokens]', N'U') IS NOT NULL
                DROP TABLE [DevicePushTokens];

            IF COL_LENGTH('Customers', 'OnboardingPushesSentAt') IS NOT NULL
                ALTER TABLE [Customers] DROP COLUMN [OnboardingPushesSentAt];

            IF COL_LENGTH('Customers', 'LastWeeklyPushAt') IS NOT NULL
                ALTER TABLE [Customers] DROP COLUMN [LastWeeklyPushAt];
            """);
    }
}
