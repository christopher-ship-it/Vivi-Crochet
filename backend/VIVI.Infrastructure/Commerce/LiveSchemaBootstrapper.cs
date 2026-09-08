using Microsoft.EntityFrameworkCore;
using VIVI.Infrastructure.Data;

namespace VIVI.Infrastructure.Commerce;

/// <summary>
/// Ensures Live Crochet Studio tables exist even if a hand-written EF migration
/// was not recorded in __EFMigrationsHistory (production recovery path).
/// </summary>
public static class LiveSchemaBootstrapper
{
    public static async Task EnsureAsync(ViviDbContext db, CancellationToken cancellationToken)
    {
        // Fast path: skip multi-statement DDL probes when Live Studio is already present.
        var ready = await db.Database
            .SqlQueryRaw<int>(
                """
                SELECT CASE
                    WHEN OBJECT_ID(N'[LiveWeeks]', N'U') IS NOT NULL
                     AND OBJECT_ID(N'[LiveWeekSlots]', N'U') IS NOT NULL
                     AND OBJECT_ID(N'[LiveBookings]', N'U') IS NOT NULL
                     AND COL_LENGTH('OrderItems', 'LiveWeekId') IS NOT NULL
                    THEN 1 ELSE 0 END AS [Value]
                """)
            .FirstAsync(cancellationToken);

        if (ready == 1)
            return;

        // OrderItems columns
        await db.Database.ExecuteSqlRawAsync(
            """
            IF COL_LENGTH('OrderItems', 'LiveWeekId') IS NULL
                ALTER TABLE [OrderItems] ADD [LiveWeekId] uniqueidentifier NULL;
            IF COL_LENGTH('OrderItems', 'LiveSlotType') IS NULL
                ALTER TABLE [OrderItems] ADD [LiveSlotType] int NULL;
            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_OrderItems_LiveWeekId' AND object_id = OBJECT_ID('OrderItems'))
                CREATE INDEX [IX_OrderItems_LiveWeekId] ON [OrderItems] ([LiveWeekId]);
            """,
            cancellationToken);

        await db.Database.ExecuteSqlRawAsync(
            """
            IF OBJECT_ID(N'[LiveWeeks]', N'U') IS NULL
            BEGIN
                CREATE TABLE [LiveWeeks] (
                    [Id] uniqueidentifier NOT NULL,
                    [WeekNumber] int NOT NULL,
                    [SeasonYear] int NOT NULL,
                    [StartDate] date NOT NULL,
                    [EndDate] date NOT NULL,
                    [BreakWeekday] int NULL,
                    [IsBookable] bit NOT NULL,
                    [CreatedAt] datetime2 NOT NULL,
                    [UpdatedAt] datetime2 NOT NULL,
                    CONSTRAINT [PK_LiveWeeks] PRIMARY KEY ([Id])
                );
                CREATE UNIQUE INDEX [IX_LiveWeeks_SeasonYear_WeekNumber] ON [LiveWeeks] ([SeasonYear], [WeekNumber]);
                CREATE INDEX [IX_LiveWeeks_StartDate] ON [LiveWeeks] ([StartDate]);
            END
            """,
            cancellationToken);

        await db.Database.ExecuteSqlRawAsync(
            """
            IF OBJECT_ID(N'[LiveWeekSlots]', N'U') IS NULL
            BEGIN
                CREATE TABLE [LiveWeekSlots] (
                    [Id] uniqueidentifier NOT NULL,
                    [LiveWeekId] uniqueidentifier NOT NULL,
                    [SlotType] int NOT NULL,
                    [SeatCapacity] int NOT NULL,
                    [SeatsBooked] int NOT NULL,
                    [CreatedAt] datetime2 NOT NULL,
                    [UpdatedAt] datetime2 NOT NULL,
                    CONSTRAINT [PK_LiveWeekSlots] PRIMARY KEY ([Id]),
                    CONSTRAINT [FK_LiveWeekSlots_LiveWeeks_LiveWeekId]
                        FOREIGN KEY ([LiveWeekId]) REFERENCES [LiveWeeks] ([Id]) ON DELETE CASCADE
                );
                CREATE UNIQUE INDEX [IX_LiveWeekSlots_LiveWeekId_SlotType] ON [LiveWeekSlots] ([LiveWeekId], [SlotType]);
            END
            """,
            cancellationToken);

        await db.Database.ExecuteSqlRawAsync(
            """
            IF OBJECT_ID(N'[LiveBookings]', N'U') IS NULL
            BEGIN
                CREATE TABLE [LiveBookings] (
                    [Id] uniqueidentifier NOT NULL,
                    [CustomerId] uniqueidentifier NOT NULL,
                    [LiveWeekId] uniqueidentifier NOT NULL,
                    [SlotType] int NOT NULL,
                    [OrderId] uniqueidentifier NOT NULL,
                    [OrderItemId] uniqueidentifier NOT NULL,
                    [Status] int NOT NULL,
                    [ReservationExpiresAt] datetime2 NULL,
                    [CreatedAt] datetime2 NOT NULL,
                    [UpdatedAt] datetime2 NOT NULL,
                    [ConfirmedAt] datetime2 NULL,
                    CONSTRAINT [PK_LiveBookings] PRIMARY KEY ([Id]),
                    CONSTRAINT [FK_LiveBookings_Customers_CustomerId]
                        FOREIGN KEY ([CustomerId]) REFERENCES [Customers] ([Id]) ON DELETE NO ACTION,
                    CONSTRAINT [FK_LiveBookings_LiveWeeks_LiveWeekId]
                        FOREIGN KEY ([LiveWeekId]) REFERENCES [LiveWeeks] ([Id]) ON DELETE NO ACTION,
                    CONSTRAINT [FK_LiveBookings_Orders_OrderId]
                        FOREIGN KEY ([OrderId]) REFERENCES [Orders] ([Id]) ON DELETE NO ACTION,
                    CONSTRAINT [FK_LiveBookings_OrderItems_OrderItemId]
                        FOREIGN KEY ([OrderItemId]) REFERENCES [OrderItems] ([Id]) ON DELETE NO ACTION
                );
                CREATE INDEX [IX_LiveBookings_CustomerId_LiveWeekId_SlotType]
                    ON [LiveBookings] ([CustomerId], [LiveWeekId], [SlotType]);
                CREATE UNIQUE INDEX [IX_LiveBookings_OrderId] ON [LiveBookings] ([OrderId]);
                CREATE INDEX [IX_LiveBookings_LiveWeekId] ON [LiveBookings] ([LiveWeekId]);
                CREATE INDEX [IX_LiveBookings_OrderItemId] ON [LiveBookings] ([OrderItemId]);
                CREATE INDEX [IX_LiveBookings_CustomerId] ON [LiveBookings] ([CustomerId]);
            END
            """,
            cancellationToken);

        // Record migration so EF history stays consistent when present.
        await db.Database.ExecuteSqlRawAsync(
            """
            IF OBJECT_ID(N'[__EFMigrationsHistory]', N'U') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1 FROM [__EFMigrationsHistory]
                    WHERE [MigrationId] = N'20260904120000_AddLiveCrochetStudio')
            BEGIN
                INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
                VALUES (N'20260904120000_AddLiveCrochetStudio', N'10.0.0');
            END
            """,
            cancellationToken);
    }
}
