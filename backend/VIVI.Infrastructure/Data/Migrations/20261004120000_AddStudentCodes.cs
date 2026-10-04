using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VIVI.Infrastructure.Data;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

/// <summary>Student codes: the code table, the student price/counter, and the student flag on memberships. Idempotent.</summary>
[DbContext(typeof(ViviDbContext))]
[Migration("20261004120000_AddStudentCodes")]
public sealed class AddStudentCodes : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        foreach (var statement in StudentOfferSchemaSql.Up)
            migrationBuilder.Sql(statement);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_LaunchMemberships_CourseId_IsStudent_MemberNumber')
                DROP INDEX [IX_LaunchMemberships_CourseId_IsStudent_MemberNumber] ON [LaunchMemberships];
            """);
        migrationBuilder.Sql("""
            IF COL_LENGTH('LaunchMemberships', 'StudentCodeId') IS NOT NULL
            BEGIN
                IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_LaunchMemberships_StudentCodes_StudentCodeId')
                    ALTER TABLE [LaunchMemberships] DROP CONSTRAINT [FK_LaunchMemberships_StudentCodes_StudentCodeId];
                IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_LaunchMemberships_StudentCodeId')
                    DROP INDEX [IX_LaunchMemberships_StudentCodeId] ON [LaunchMemberships];
            END
            """);
        migrationBuilder.Sql("""
            IF COL_LENGTH('LaunchMemberships', 'StudentCodeId') IS NOT NULL
                ALTER TABLE [LaunchMemberships] DROP COLUMN [StudentCodeId];
            IF COL_LENGTH('LaunchMemberships', 'IsStudent') IS NOT NULL
            BEGIN
                ALTER TABLE [LaunchMemberships] DROP CONSTRAINT [DF_LaunchMemberships_IsStudent];
                ALTER TABLE [LaunchMemberships] DROP COLUMN [IsStudent];
            END
            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_LaunchMemberships_CourseId_MemberNumber')
                CREATE UNIQUE INDEX [IX_LaunchMemberships_CourseId_MemberNumber]
                    ON [LaunchMemberships] ([CourseId], [MemberNumber]);
            """);
        migrationBuilder.Sql("""
            IF COL_LENGTH('OrderItems', 'StudentCodeId') IS NOT NULL
            BEGIN
                IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_OrderItems_StudentCodes_StudentCodeId')
                    ALTER TABLE [OrderItems] DROP CONSTRAINT [FK_OrderItems_StudentCodes_StudentCodeId];
                IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_OrderItems_StudentCodeId')
                    DROP INDEX [IX_OrderItems_StudentCodeId] ON [OrderItems];
                ALTER TABLE [OrderItems] DROP COLUMN [StudentCodeId];
            END
            """);
        migrationBuilder.Sql("""
            IF COL_LENGTH('CoursePrices', 'StudentPrice') IS NOT NULL
                ALTER TABLE [CoursePrices] DROP COLUMN [StudentPrice];
            """);
        migrationBuilder.Sql("""
            IF COL_LENGTH('LaunchOfferCounters', 'StudentPrice') IS NOT NULL
            BEGIN
                ALTER TABLE [LaunchOfferCounters] DROP CONSTRAINT [DF_LaunchOfferCounters_StudentPrice];
                ALTER TABLE [LaunchOfferCounters] DROP COLUMN [StudentPrice];
            END
            IF COL_LENGTH('LaunchOfferCounters', 'StudentCompletedCount') IS NOT NULL
            BEGIN
                ALTER TABLE [LaunchOfferCounters] DROP CONSTRAINT [DF_LaunchOfferCounters_StudentCompletedCount];
                ALTER TABLE [LaunchOfferCounters] DROP COLUMN [StudentCompletedCount];
            END
            IF OBJECT_ID(N'[StudentCodes]', N'U') IS NOT NULL DROP TABLE [StudentCodes];
            """);
    }
}
