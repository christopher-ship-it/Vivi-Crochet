using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VIVI.Infrastructure.Data;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

[DbContext(typeof(ViviDbContext))]
[Migration("20260911190000_AddPasswordResetChallenges")]
public sealed class AddPasswordResetChallenges : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF OBJECT_ID(N'[PasswordResetChallenges]', N'U') IS NULL
            BEGIN
                CREATE TABLE [PasswordResetChallenges] (
                    [Id] uniqueidentifier NOT NULL,
                    [Email] nvarchar(256) NOT NULL,
                    [CodeHash] nvarchar(64) NOT NULL,
                    [ExpiresAt] datetime2 NOT NULL,
                    [AttemptCount] int NOT NULL,
                    [VerifiedAt] datetime2 NULL,
                    [CreatedAt] datetime2 NOT NULL,
                    CONSTRAINT [PK_PasswordResetChallenges] PRIMARY KEY ([Id])
                );
                CREATE INDEX [IX_PasswordResetChallenges_Email] ON [PasswordResetChallenges] ([Email]);
                CREATE INDEX [IX_PasswordResetChallenges_ExpiresAt] ON [PasswordResetChallenges] ([ExpiresAt]);
            END
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF OBJECT_ID(N'[PasswordResetChallenges]', N'U') IS NOT NULL
                DROP TABLE [PasswordResetChallenges];
            """);
    }
}
