using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VIVI.Infrastructure.Data;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

[DbContext(typeof(ViviDbContext))]
[Migration("20260914140000_AddSupportInquiries")]
public sealed class AddSupportInquiries : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF OBJECT_ID(N'[SupportInquiries]', N'U') IS NULL
            BEGIN
                CREATE TABLE [SupportInquiries] (
                    [Id] uniqueidentifier NOT NULL,
                    [CustomerId] uniqueidentifier NOT NULL,
                    [Message] nvarchar(2000) NOT NULL,
                    [CreatedAt] datetime2 NOT NULL,
                    [IsRead] bit NOT NULL CONSTRAINT [DF_SupportInquiries_IsRead] DEFAULT CAST(0 AS bit),
                    CONSTRAINT [PK_SupportInquiries] PRIMARY KEY ([Id]),
                    CONSTRAINT [FK_SupportInquiries_Customers_CustomerId]
                        FOREIGN KEY ([CustomerId]) REFERENCES [Customers] ([Id]) ON DELETE CASCADE
                );
                CREATE INDEX [IX_SupportInquiries_CustomerId] ON [SupportInquiries] ([CustomerId]);
                CREATE INDEX [IX_SupportInquiries_CreatedAt] ON [SupportInquiries] ([CreatedAt]);
                CREATE INDEX [IX_SupportInquiries_IsRead] ON [SupportInquiries] ([IsRead]);
            END
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF OBJECT_ID(N'[SupportInquiries]', N'U') IS NOT NULL
                DROP TABLE [SupportInquiries];
            """);
    }
}
