using Microsoft.EntityFrameworkCore;
using VIVI.Core;

namespace VIVI.Infrastructure.Data;

/// <summary>
/// Customer ID (VC-…) and founding-member ID (VV-…) columns, indexes and backfill. Shared by the
/// EF migration and the startup bootstrapper (production runs with AutoMigrate=false).
/// </summary>
public static class PublicIdSchema
{
    /// <summary>
    /// Run in order, one batch each: SQL Server cannot add a column and use it in an index in
    /// the same batch.
    /// </summary>
    public static readonly string[] Statements =
    [
        """
        IF OBJECT_ID(N'[Customers]', N'U') IS NOT NULL
           AND COL_LENGTH('Customers', 'CustomerCode') IS NULL
            ALTER TABLE [Customers] ADD [CustomerCode] nvarchar(16) NULL;
        """,
        """
        IF OBJECT_ID(N'[LaunchMemberships]', N'U') IS NOT NULL
           AND COL_LENGTH('LaunchMemberships', 'MemberCode') IS NULL
            ALTER TABLE [LaunchMemberships] ADD [MemberCode] nvarchar(16) NULL;
        """,
        """
        IF COL_LENGTH('Customers', 'CustomerCode') IS NOT NULL
           AND NOT EXISTS (
                SELECT 1 FROM sys.indexes
                WHERE name = N'IX_Customers_CustomerCode'
                  AND object_id = OBJECT_ID(N'[Customers]'))
            CREATE UNIQUE INDEX [IX_Customers_CustomerCode]
                ON [Customers] ([CustomerCode]) WHERE [CustomerCode] IS NOT NULL;
        """,
        """
        IF COL_LENGTH('LaunchMemberships', 'MemberCode') IS NOT NULL
           AND NOT EXISTS (
                SELECT 1 FROM sys.indexes
                WHERE name = N'IX_LaunchMemberships_MemberCode'
                  AND object_id = OBJECT_ID(N'[LaunchMemberships]'))
            CREATE UNIQUE INDEX [IX_LaunchMemberships_MemberCode]
                ON [LaunchMemberships] ([MemberCode]) WHERE [MemberCode] IS NOT NULL;
        """
    ];

    public static async Task EnsureAsync(ViviDbContext db, CancellationToken cancellationToken)
    {
        foreach (var statement in Statements)
            await db.Database.ExecuteSqlRawAsync(statement, cancellationToken);

        await BackfillAsync(db, cancellationToken);
    }

    /// <summary>Gives every existing customer and founding member an ID. Safe to re-run.</summary>
    public static async Task BackfillAsync(ViviDbContext db, CancellationToken cancellationToken)
    {
        while (true)
        {
            var batch = await db.Customers
                .Where(c => c.CustomerCode == null)
                .Take(500)
                .ToListAsync(cancellationToken);
            if (batch.Count == 0)
                break;

            foreach (var customer in batch)
                customer.CustomerCode = await db.UnusedCustomerCodeAsync(cancellationToken);
            await db.SaveChangesAsync(cancellationToken);
        }

        var memberships = await db.LaunchMemberships
            .Where(m => m.MemberCode == null)
            .ToListAsync(cancellationToken);
        if (memberships.Count == 0)
            return;

        foreach (var membership in memberships)
            membership.MemberCode = PublicIds.NewMemberCode(membership.MemberNumber);
        await db.SaveChangesAsync(cancellationToken);
    }
}
