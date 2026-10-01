using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

/// <summary>Adds CoursePrices: per-country course prices (USD for the United States). Idempotent.</summary>
[DbContext(typeof(ViviDbContext))]
[Migration("20260930150000_AddCoursePrices")]
public sealed class AddCoursePrices : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF OBJECT_ID(N'[CoursePrices]', N'U') IS NULL
            BEGIN
                CREATE TABLE [CoursePrices] (
                    [Id] uniqueidentifier NOT NULL,
                    [CourseId] uniqueidentifier NOT NULL,
                    [CountryCode] nvarchar(2) NOT NULL,
                    [Currency] nvarchar(3) NOT NULL,
                    [Price] decimal(12,2) NOT NULL,
                    [Mrp] decimal(12,2) NULL,
                    [LaunchPrice] decimal(12,2) NULL,
                    [RegularPriceAfterLaunch] decimal(12,2) NULL,
                    [UpdatedAt] datetime2 NOT NULL,
                    CONSTRAINT [PK_CoursePrices] PRIMARY KEY ([Id]),
                    CONSTRAINT [FK_CoursePrices_Courses_CourseId] FOREIGN KEY ([CourseId])
                        REFERENCES [Courses] ([Id]) ON DELETE CASCADE
                );
                CREATE UNIQUE INDEX [IX_CoursePrices_CourseId_CountryCode]
                    ON [CoursePrices] ([CourseId], [CountryCode]);
            END
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("IF OBJECT_ID(N'[CoursePrices]', N'U') IS NOT NULL DROP TABLE [CoursePrices];");
    }
}
