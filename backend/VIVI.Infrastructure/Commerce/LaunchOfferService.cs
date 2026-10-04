using System.Collections.Concurrent;
using Microsoft.EntityFrameworkCore;
using VIVI.Core;
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

    /// <summary>How long an unpaid launch-price checkout holds a slot before it stops counting.</summary>
    public static readonly TimeSpan CheckoutHoldWindow = TimeSpan.FromMinutes(15);

    /// <summary>
    /// Called when a checkout is created. If the line is at the launch price and every remaining slot is
    /// already held by other customers' unpaid checkouts, throws before any payment is started — those
    /// checkouts may still complete, and a payment taken without a free slot would have to be refunded.
    /// Held slots expire after <see cref="CheckoutHoldWindow"/>, so abandoned checkouts free them again.
    /// </summary>
    public async Task EnsureSlotAvailableForCheckoutOrThrowAsync(
        Course course,
        decimal unitPrice,
        Guid customerId,
        Market market,
        CancellationToken cancellationToken)
    {
        if (course.Type != CourseType.Bundle)
            return;

        var offer = await _db.LaunchOfferCounters
            .AsNoTracking()
            .SingleOrDefaultAsync(c => c.CourseId == course.Id, cancellationToken);
        if (offer is null || !offer.IsActive)
            return;

        var prices = await _db.CoursePrices
            .AsNoTracking()
            .Where(p => p.CourseId == course.Id)
            .ToListAsync(cancellationToken);

        if (!IsLaunchPriceFor(offer, prices, market, unitPrice))
            return;

        var remaining = offer.LaunchLimit - offer.CompletedPurchaseCount;
        if (remaining <= 0)
            return;

        var since = DateTime.UtcNow - CheckoutHoldWindow;
        var pending = await _db.OrderItems
            .AsNoTracking()
            .Where(i => i.CourseId == course.Id
                        && i.StudentCodeId == null
                        && i.Order!.Status == OrderStatus.PendingPayment
                        && i.Order.CustomerId != customerId
                        && i.Order.CreatedAt >= since)
            .Select(i => new { i.UnitPrice, i.Order!.Currency })
            .ToListAsync(cancellationToken);

        var held = pending.Count(p =>
            IsLaunchPriceFor(offer, prices, Markets.ForCurrency(p.Currency), p.UnitPrice));

        if (held >= remaining)
        {
            throw ViviException.Conflict(
                "LAUNCH_OFFER_SLOTS_HELD",
                "The last launch-offer spots are being held by checkouts in progress. Please try again in a few minutes.");
        }
    }

    private static bool IsLaunchPriceFor(
        LaunchOfferCounter offer,
        IReadOnlyList<CoursePrice> prices,
        Market market,
        decimal unitPrice)
    {
        if (market.UsesBasePrices)
            return IsLaunchUnitPrice(offer, unitPrice);

        var row = prices.FirstOrDefault(p => p.CountryCode == market.CountryCode);
        return row?.LaunchPrice is decimal launch
               && decimal.Round(unitPrice, 2, MidpointRounding.AwayFromZero) == launch;
    }

    /// <summary>
    /// Finds a student code the customer typed and checks it can be used now. Matching ignores case, spaces and dashes.
    /// Throws a <c>STUDENT_CODE_*</c> conflict when it is unknown, switched off, expired or fully used.
    /// </summary>
    public async Task<StudentCode> ResolveStudentCodeOrThrowAsync(
        string? typedCode,
        Guid customerId,
        CancellationToken cancellationToken)
    {
        var normalized = PublicIds.NormalizeStudentCode(typedCode);
        if (normalized.Length == 0)
            throw ViviException.Conflict("STUDENT_CODE_INVALID", "Enter your student code.");

        var codes = await _db.StudentCodes.AsNoTracking().ToListAsync(cancellationToken);
        var code = codes.FirstOrDefault(c => PublicIds.NormalizeStudentCode(c.Code) == normalized)
                   ?? throw ViviException.Conflict("STUDENT_CODE_INVALID", "This student code is not valid.");

        if (!code.IsActive)
            throw ViviException.Conflict("STUDENT_CODE_INACTIVE", "This student code is no longer active.");
        if (code.ExpiresAt is DateTime expires && expires <= DateTime.UtcNow)
            throw ViviException.Conflict("STUDENT_CODE_EXPIRED", "This student code has expired.");
        if (code.MaxUses is int max && code.UsedCount >= max)
            throw ViviException.Conflict("STUDENT_CODE_EXHAUSTED", "This student code has been fully used.");

        if (code.MaxUses is int cap)
        {
            // Same idea as the launch slots: other customers' unpaid checkouts hold uses for a while.
            var since = DateTime.UtcNow - CheckoutHoldWindow;
            var held = await _db.OrderItems
                .AsNoTracking()
                .CountAsync(i => i.StudentCodeId == code.Id
                                 && i.Order!.Status == OrderStatus.PendingPayment
                                 && i.Order.CustomerId != customerId
                                 && i.Order.CreatedAt >= since,
                    cancellationToken);
            if (code.UsedCount + held >= cap)
                throw ViviException.Conflict(
                    "STUDENT_CODE_HELD",
                    "The last uses of this student code are being held by checkouts in progress. Please try again in a few minutes.");
        }

        return code;
    }

    /// <summary>
    /// The price a student pays for the bundle in the buyer's market: the student price for India, or the
    /// country's own student price. A country with no student price set cannot use student codes.
    /// </summary>
    public async Task<decimal> GetStudentPriceOrThrowAsync(
        Guid bundleCourseId,
        Market market,
        CancellationToken cancellationToken)
    {
        if (market.UsesBasePrices)
        {
            var offer = await _db.LaunchOfferCounters
                .AsNoTracking()
                .SingleOrDefaultAsync(c => c.CourseId == bundleCourseId, cancellationToken)
                ?? throw ViviException.NotFound("OFFER_NOT_FOUND", "No special offer is configured for this course.");
            return offer.StudentPrice;
        }

        var row = await _db.CoursePrices
            .AsNoTracking()
            .SingleOrDefaultAsync(
                p => p.CourseId == bundleCourseId && p.CountryCode == market.CountryCode,
                cancellationToken);
        return row?.StudentPrice
               ?? throw ViviException.Conflict(
                   "STUDENT_CODE_NOT_AVAILABLE",
                   "Student codes are not available in your country yet.");
    }

    /// <summary>
    /// After a successful student payment: uses one run of the code and allocates the next student member number.
    /// Both are atomic and independent of the launch slots, so students never count toward the 100.
    /// </summary>
    public async Task<int> ConsumeStudentPurchaseAsync(
        Guid studentCodeId,
        Guid bundleCourseId,
        CancellationToken cancellationToken)
    {
        if (_db.Database.IsRelational())
        {
            var used = await _db.Database
                .SqlQueryRaw<int>(
                    """
                    UPDATE StudentCodes
                    SET UsedCount = UsedCount + 1, UpdatedAt = SYSUTCDATETIME()
                    OUTPUT INSERTED.UsedCount AS [Value]
                    WHERE Id = {0} AND (MaxUses IS NULL OR UsedCount < MaxUses)
                    """,
                    studentCodeId)
                .ToListAsync(cancellationToken);
            if (used.Count != 1)
                throw ViviException.Conflict(
                    "STUDENT_CODE_EXHAUSTED",
                    "This student code has been fully used. Place a new order to pay the current bundle price.");

            var allocated = await _db.Database
                .SqlQueryRaw<int>(
                    """
                    UPDATE LaunchOfferCounters
                    SET StudentCompletedCount = StudentCompletedCount + 1, UpdatedAt = SYSUTCDATETIME()
                    OUTPUT INSERTED.StudentCompletedCount AS [Value]
                    WHERE CourseId = {0}
                    """,
                    bundleCourseId)
                .ToListAsync(cancellationToken);
            return allocated.Count == 1
                ? allocated[0]
                : throw ViviException.NotFound("OFFER_NOT_FOUND", "No special offer is configured for this course.");
        }

        var gate = InMemoryGates.GetOrAdd(bundleCourseId, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(cancellationToken);
        try
        {
            var code = await _db.StudentCodes.SingleAsync(c => c.Id == studentCodeId, cancellationToken);
            await _db.Entry(code).ReloadAsync(cancellationToken);
            if (code.MaxUses is int max && code.UsedCount >= max)
                throw ViviException.Conflict(
                    "STUDENT_CODE_EXHAUSTED",
                    "This student code has been fully used. Place a new order to pay the current bundle price.");
            var offer = await _db.LaunchOfferCounters.SingleAsync(c => c.CourseId == bundleCourseId, cancellationToken);
            await _db.Entry(offer).ReloadAsync(cancellationToken);

            code.UsedCount += 1;
            code.UpdatedAt = DateTime.UtcNow;
            offer.StudentCompletedCount += 1;
            offer.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(cancellationToken);
            return offer.StudentCompletedCount;
        }
        finally
        {
            gate.Release();
        }
    }

    /// <summary>
    /// If this line was sold at the launch price, atomically consumes one slot and
    /// allocates the next sequential member number. Regular-priced purchases (including
    /// purchases made after the offer is exhausted or deactivated) are not applicable.
    /// </summary>
    public async Task<LaunchOfferConsumptionResult> TryConsumeForSuccessfulPurchaseAsync(
        Guid bundleCourseId,
        decimal unitPrice,
        CancellationToken cancellationToken,
        Market? market = null)
    {
        var offer = await _db.LaunchOfferCounters
            .SingleOrDefaultAsync(c => c.CourseId == bundleCourseId, cancellationToken);
        if (offer is null || !offer.IsActive)
            return LaunchOfferConsumptionResult.NotApplicable;

        var isLaunchPrice = IsLaunchUnitPrice(offer, unitPrice);
        if (market is { UsesBasePrices: false })
        {
            // Sold in another currency: compare with that market's own launch price.
            var row = await _db.CoursePrices
                .AsNoTracking()
                .SingleOrDefaultAsync(
                    p => p.CourseId == bundleCourseId && p.CountryCode == market.CountryCode,
                    cancellationToken);
            isLaunchPrice = row?.LaunchPrice is decimal launch
                            && decimal.Round(unitPrice, 2, MidpointRounding.AwayFromZero) == launch;
        }

        if (!isLaunchPrice)
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
        CancellationToken cancellationToken,
        Market? market = null)
    {
        if (course.Type != CourseType.Bundle)
            return null;

        var result = await TryConsumeForSuccessfulPurchaseAsync(course.Id, unitPrice, cancellationToken, market);
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
