using System.Collections.Concurrent;
using Microsoft.EntityFrameworkCore;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Infrastructure.Data;

namespace VIVI.Infrastructure.Commerce;

/// <summary>
/// Single owner of launch-offer remaining-count and consumption.
/// Slots are consumed only after a successful payment, via an atomic increment
/// that cannot exceed LaunchLimit.
/// </summary>
public sealed class LaunchOfferService
{
    private static readonly ConcurrentDictionary<Guid, SemaphoreSlim> InMemoryGates = new();

    private readonly ViviDbContext _db;

    public LaunchOfferService(ViviDbContext db) => _db = db;

    public static bool IsLaunchUnitPrice(LaunchOfferCounter offer, decimal unitPrice)
        => decimal.Round(unitPrice, 0, MidpointRounding.AwayFromZero) == offer.LaunchPrice;

    /// <summary>
    /// If this line was sold at the launch price, consume one slot.
    /// Returns false when the 100-purchase cap has already been reached.
    /// Regular-priced purchases do not consume a slot.
    /// </summary>
    public async Task<bool> TryConsumeForSuccessfulPurchaseAsync(
        Guid bundleCourseId,
        decimal unitPrice,
        CancellationToken cancellationToken)
    {
        var offer = await _db.LaunchOfferCounters
            .SingleOrDefaultAsync(c => c.CourseId == bundleCourseId, cancellationToken);
        if (offer is null)
            return true;

        if (!IsLaunchUnitPrice(offer, unitPrice))
            return true;

        if (_db.Database.IsRelational())
        {
            var rows = await _db.Database.ExecuteSqlInterpolatedAsync(
                $"""
                UPDATE LaunchOfferCounters
                SET CompletedPurchaseCount = CompletedPurchaseCount + 1,
                    UpdatedAt = SYSUTCDATETIME()
                WHERE CourseId = {bundleCourseId}
                  AND CompletedPurchaseCount < LaunchLimit
                """,
                cancellationToken);
            return rows == 1;
        }

        var gate = InMemoryGates.GetOrAdd(bundleCourseId, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(cancellationToken);
        try
        {
            await _db.Entry(offer).ReloadAsync(cancellationToken);
            if (offer.CompletedPurchaseCount >= offer.LaunchLimit)
                return false;

            offer.CompletedPurchaseCount += 1;
            offer.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(cancellationToken);
            return true;
        }
        finally
        {
            gate.Release();
        }
    }

    public async Task EnsureLaunchSlotForPricedOrderOrThrowAsync(
        Course course,
        decimal unitPrice,
        CancellationToken cancellationToken)
    {
        if (course.Type != CourseType.Bundle)
            return;

        var consumed = await TryConsumeForSuccessfulPurchaseAsync(course.Id, unitPrice, cancellationToken);
        if (!consumed)
        {
            throw ViviException.Conflict(
                "LAUNCH_OFFER_EXHAUSTED",
                "The launch offer is no longer available at this price. Place a new order to pay the current bundle price.");
        }
    }
}
