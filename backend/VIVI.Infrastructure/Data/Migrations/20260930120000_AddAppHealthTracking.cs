using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VIVI.Infrastructure.Data;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

[DbContext(typeof(ViviDbContext))]
[Migration("20260930120000_AddAppHealthTracking")]
public sealed class AddAppHealthTracking : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF OBJECT_ID(N'[AppIssues]', N'U') IS NULL
            BEGIN
                CREATE TABLE [AppIssues] (
                    [Id] uniqueidentifier NOT NULL,
                    [UserId] uniqueidentifier NULL,
                    [Kind] nvarchar(16) NOT NULL,
                    [Title] nvarchar(300) NOT NULL,
                    [Details] nvarchar(max) NULL,
                    [Screen] nvarchar(200) NULL,
                    [AppVersion] nvarchar(40) NULL,
                    [Platform] nvarchar(40) NULL,
                    [DeviceInfo] nvarchar(300) NULL,
                    [IsFatal] bit NOT NULL CONSTRAINT [DF_AppIssues_IsFatal] DEFAULT CAST(0 AS bit),
                    [CreatedAt] datetime2 NOT NULL,
                    [IsResolved] bit NOT NULL CONSTRAINT [DF_AppIssues_IsResolved] DEFAULT CAST(0 AS bit),
                    [ResolvedAt] datetime2 NULL,
                    CONSTRAINT [PK_AppIssues] PRIMARY KEY ([Id])
                );
                CREATE INDEX [IX_AppIssues_CreatedAt] ON [AppIssues] ([CreatedAt]);
                CREATE INDEX [IX_AppIssues_Kind_IsResolved] ON [AppIssues] ([Kind], [IsResolved]);
            END

            IF OBJECT_ID(N'[ScreenTapCells]', N'U') IS NULL
            BEGIN
                CREATE TABLE [ScreenTapCells] (
                    [Id] uniqueidentifier NOT NULL,
                    [Screen] nvarchar(200) NOT NULL,
                    [Col] int NOT NULL,
                    [Row] int NOT NULL,
                    [Taps] bigint NOT NULL,
                    [UpdatedAt] datetime2 NOT NULL,
                    CONSTRAINT [PK_ScreenTapCells] PRIMARY KEY ([Id])
                );
                CREATE UNIQUE INDEX [IX_ScreenTapCells_Screen_Col_Row]
                    ON [ScreenTapCells] ([Screen], [Col], [Row]);
            END
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF OBJECT_ID(N'[AppIssues]', N'U') IS NOT NULL DROP TABLE [AppIssues];
            IF OBJECT_ID(N'[ScreenTapCells]', N'U') IS NOT NULL DROP TABLE [ScreenTapCells];
            """);
    }
}
