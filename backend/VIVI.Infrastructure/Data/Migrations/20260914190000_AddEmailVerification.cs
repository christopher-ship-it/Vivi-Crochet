using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VIVI.Infrastructure.Data;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

[DbContext(typeof(ViviDbContext))]
[Migration("20260914190000_AddEmailVerification")]
public sealed class AddEmailVerification : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF COL_LENGTH('Customers', 'EmailVerifiedAt') IS NULL
                ALTER TABLE [Customers] ADD [EmailVerifiedAt] datetime2 NULL;

            IF OBJECT_ID(N'[EmailVerificationChallenges]', N'U') IS NULL
            BEGIN
                CREATE TABLE [EmailVerificationChallenges] (
                    [Id] uniqueidentifier NOT NULL,
                    [CustomerId] uniqueidentifier NOT NULL,
                    [Email] nvarchar(256) NOT NULL,
                    [CodeHash] nvarchar(64) NOT NULL,
                    [ExpiresAt] datetime2 NOT NULL,
                    [AttemptCount] int NOT NULL,
                    [VerifiedAt] datetime2 NULL,
                    [CreatedAt] datetime2 NOT NULL,
                    CONSTRAINT [PK_EmailVerificationChallenges] PRIMARY KEY ([Id]),
                    CONSTRAINT [FK_EmailVerificationChallenges_Customers_CustomerId]
                        FOREIGN KEY ([CustomerId]) REFERENCES [Customers] ([Id]) ON DELETE CASCADE
                );
                CREATE INDEX [IX_EmailVerificationChallenges_CustomerId]
                    ON [EmailVerificationChallenges] ([CustomerId]);
                CREATE INDEX [IX_EmailVerificationChallenges_Email]
                    ON [EmailVerificationChallenges] ([Email]);
                CREATE INDEX [IX_EmailVerificationChallenges_ExpiresAt]
                    ON [EmailVerificationChallenges] ([ExpiresAt]);
            END
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF OBJECT_ID(N'[EmailVerificationChallenges]', N'U') IS NOT NULL
                DROP TABLE [EmailVerificationChallenges];

            IF COL_LENGTH('Customers', 'EmailVerifiedAt') IS NOT NULL
                ALTER TABLE [Customers] DROP COLUMN [EmailVerifiedAt];
            """);
    }
}
