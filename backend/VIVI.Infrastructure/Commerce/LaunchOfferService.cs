using System.Collections.Concurrent;
using Microsoft.EntityFrameworkCore;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Infrastructure.Data;

namespace VIVI.Infrastructure.Commerce;

/// <summary>Result of attempting to consume one launch-offer slot.</summary>
public readonly record struct LaunchOfferConsumptionResult(bool IsApplicable, bool Success, int? MemberNumber)
{
    /// <summary>Not a launch-price purchase — nothing to consume, no membership to grant.</summary>
    public static readonly LaunchOfferConsumptionResult NotApplicable = new(false, true, null);

    /// <summary>A launch-price purchase, but the cap was already reached.</summary>
    public static readonly LaunchOfferConsumptionResult Exhausted = new(true, false, null);

    /// <summary>A launch-price purchase that consumed slot/member number <paramref name="memberNumber"/>.</summary>
    public static LaunchOfferConsumptionResult Consumed(int memberNumber) => new(true, true, memberNumber);
}

/// <summary>
/// Single owner of launch-offer remaining-count and consumption.
/// Slots are consumed only after a successful payment, via an atomic increment
/// that cannot exceed LaunchLimit. The post-increment count doubles as the
/// sequential founding-member number, captured in the same atomic statement.
/// </summary>
public sealed class LaunchOfferService
{
    private static readonly ConcurrentDictionary<Guid, SemaphoreSlim> InMemoryGates = new();

    private readonly ViviDbContext _db;

    public LaunchOfferService(ViviDbContext db) => _db = db;

    public static bool IsLaunchUnitPrice(LaunchOfferCounter offer, decimal unitPrice)
        => decimal.Round(unitPrice, 0, MidpointRounding.AwayFromZero) == offer.LaunchPrice;

    /// <summary>
    /// If this line was sold at the launch price, atomically consumes one slot and
    /// allocates the next sequential member number. Regular-priced purchases (including
    /// purchases made after the offer is exhausted or deactivated) are not applicable.
    /// </summary>
    public async Task<LaunchOfferConsumptionResult> TryConsumeForSuccessfulPurchaseAsync(
        Guid bundleCourseId,
        decimal unitPrice,
        CancellationToken cancellationToken)
    {
        var offer = await _db.LaunchOfferCounters
            .SingleOrDefaultAsync(c => c.CourseId == bundleCourseId, cancellationToken);
        if (offer is null || !offer.IsActive || !IsLaunchUnitPrice(offer, unitPrice))
            return LaunchOfferConsumptionResult.NotApplicable;

        if (_db.Database.IsRelational())
        {
            var allocated = await _db.Database
                .SqlQueryRaw<int>(
                    """
                    UPDATE LaunchOfferCounters
                    SET CompletedPurchaseCount = CompletedPurchaseCount + 1,
                        UpdatedAt = SYSUTCDATETIME()
                    OUTPUT INSERTED.CompletedPurchaseCount AS [Value]
                    WHERE CourseId = {0} AND CompletedPurchaseCount < LaunchLimit
                    """,
                    bundleCourseId)
                .ToListAsync(cancellationToken);

            return allocated.Count == 1
                ? LaunchOfferConsumptionResult.Consumed(allocated[0])
                : LaunchOfferConsumptionResult.Exhausted;
        }

        var gate = InMemoryGates.GetOrAdd(bundleCourseId, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(cancellationToken);
        try
        {
            await _db.Entry(offer).ReloadAsync(cancellationToken);
            if (offer.CompletedPurchaseCount >= offer.LaunchLimit)
                return LaunchOfferConsumptionResult.Exhausted;

            offer.CompletedPurchaseCount += 1;
            offer.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(cancellationToken);
            return LaunchOfferConsumptionResult.Consumed(offer.CompletedPurchaseCount);
        }
        finally
        {
            gate.Release();
        }
    }

    /// <summary>
    /// Consumes a slot for a bundle purchase priced at the launch price, throwing if the cap
    /// was just reached. Returns the allocated founding-member number, or null when this purchase
    /// was not at the launch price (non-bundle course, regular-priced bundle, or renewal purchase).
    /// </summary>
    public async Task<int?> EnsureLaunchSlotForPricedOrderOrThrowAsync(
        Course course,
        decimal unitPrice,
        CancellationToken cancellationToken)
    {
        if (course.Type != CourseType.Bundle)
            return null;

        var result = await TryConsumeForSuccessfulPurchaseAsync(course.Id, unitPrice, cancellationToken);
        if (!result.IsApplicable)
            return null;

        if (!result.Success)
        {
            throw ViviException.Conflict(
                "LAUNCH_OFFER_EXHAUSTED",
                "The launch offer is no longer available at this price. Place a new order to pay the current bundle price.");
        }

        return result.MemberNumber;
    }
}
