using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VIVI.Infrastructure.Data;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

[DbContext(typeof(ViviDbContext))]
[Migration("20260921140000_AddProductEssentialLinks")]
public sealed class AddProductEssentialLinks : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF OBJECT_ID(N'[ProductEssentialLinks]', N'U') IS NULL
            BEGIN
                CREATE TABLE [ProductEssentialLinks] (
                    [Id] uniqueidentifier NOT NULL,
                    [SourceProductId] uniqueidentifier NOT NULL,
                    [EssentialProductId] uniqueidentifier NOT NULL,
                    [SortOrder] int NOT NULL CONSTRAINT [DF_ProductEssentialLinks_SortOrder] DEFAULT (0),
                    CONSTRAINT [PK_ProductEssentialLinks] PRIMARY KEY ([Id])
                );

                CREATE UNIQUE INDEX [IX_ProductEssentialLinks_SourceProductId_EssentialProductId]
                    ON [ProductEssentialLinks] ([SourceProductId], [EssentialProductId]);

                CREATE INDEX [IX_ProductEssentialLinks_SourceProductId_SortOrder]
                    ON [ProductEssentialLinks] ([SourceProductId], [SortOrder]);

                ALTER TABLE [ProductEssentialLinks] WITH CHECK
                ADD CONSTRAINT [FK_ProductEssentialLinks_Products_SourceProductId]
                    FOREIGN KEY ([SourceProductId]) REFERENCES [Products] ([Id]);

                ALTER TABLE [ProductEssentialLinks] WITH CHECK
                ADD CONSTRAINT [FK_ProductEssentialLinks_Products_EssentialProductId]
                    FOREIGN KEY ([EssentialProductId]) REFERENCES [Products] ([Id]);
            END
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF OBJECT_ID(N'[ProductEssentialLinks]', N'U') IS NOT NULL
                DROP TABLE [ProductEssentialLinks];
            """);
    }
}
