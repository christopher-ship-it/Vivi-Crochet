using Microsoft.EntityFrameworkCore;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Infrastructure.Data;

namespace VIVI.Infrastructure.Commerce;

public sealed record CoursePricingResult(
    Guid CourseId,
    string Name,
    int ListPrice,
    int? Mrp,
    int Price,
    bool IsLaunchOffer,
    int? LaunchOfferRemaining,
    int AccessDays,
    bool IsRenewalOffer = false,
    int? RenewalPercentage = null);

public sealed class PricingService
{
    /// <summary>Renewal offer unlocks when access has ended or ends within this many days.</summary>
    public const int RenewalWindowDays = 3;

    private readonly ViviDbContext _db;

    public PricingService(ViviDbContext db) => _db = db;

    public async Task<CoursePricingResult> GetCoursePricingAsync(
        Guid courseId,
        CancellationToken cancellationToken,
        Guid? customerId = null)
    {
        var course = await _db.Courses
            .AsNoTracking()
            .Include(c => c.LaunchOffer)
            .Include(c => c.BundleItems)
            .SingleOrDefaultAsync(c => c.Id == courseId && c.Status == CourseStatus.Published, cancellationToken)
            ?? throw new KeyNotFoundException("Course was not found.");

        var (price, launchActive, remaining) = await ResolveLaunchPriceAsync(course, cancellationToken);
        var mrp = course.Mrp ?? course.LaunchOffer?.Mrp;

        var renewal = false;
        int? renewalPct = null;
        if (customerId.HasValue)
        {
            var offer = await TryResolveRenewalAsync(course, customerId.Value, DateTime.UtcNow, cancellationToken);
            if (offer is not null)
            {
                price = offer.RenewalPrice;
                launchActive = false;
                remaining = null;
                renewal = true;
                renewalPct = offer.Percentage;
                mrp ??= offer.BasePrice;
            }
        }

        return new CoursePricingResult(
            course.Id,
            course.Name,
            course.Price,
            mrp,
            price,
            launchActive,
            remaining,
            course.AccessDays,
            renewal,
            renewalPct);
    }

    public async Task<int> ResolveUnitPriceAsync(Course course, CancellationToken cancellationToken)
    {
        var (price, _, _) = await ResolveLaunchPriceAsync(course, cancellationToken);
        return price;
    }

    /// <summary>Checkout price for a signed-in customer (applies renewal when eligible).</summary>
    public async Task<(int UnitPrice, bool IsRenewal, int BasePrice, byte Percentage)> ResolveCheckoutUnitPriceAsync(
        Course course,
        Guid customerId,
        CancellationToken cancellationToken)
    {
        var renewal = await TryResolveRenewalAsync(course, customerId, DateTime.UtcNow, cancellationToken);
        if (renewal is not null)
            return (renewal.RenewalPrice, true, renewal.BasePrice, renewal.Percentage);

        var (price, _, _) = await ResolveLaunchPriceAsync(course, cancellationToken);
        return (price, false, price, 0);
    }

    public async Task<RenewalOfferSnapshot?> TryResolveRenewalAsync(
        Course course,
        Guid customerId,
        DateTime utcNow,
        CancellationToken cancellationToken)
    {
        if (course.RenewalPercentage is < 1 or > 99)
            return null;

        var targetCourseIds = await ResolveEnrollmentCourseIdsAsync(course, cancellationToken);
        if (targetCourseIds.Count == 0)
            return null;

        var windowEnd = utcNow.AddDays(RenewalWindowDays);
        var eligible = await _db.CourseEnrollments
            .AsNoTracking()
            .AnyAsync(
                e => e.CustomerId == customerId
                     && targetCourseIds.Contains(e.CourseId)
                     && e.RenewalOfferEligibleFlag
                     && !e.RenewalOfferUsedFlag
                     && e.AccessExpiryDate <= windowEnd,
                cancellationToken);

        if (!eligible)
            return null;

        var basePrice = await ResolveRenewalBasePriceAsync(course, cancellationToken);
        var renewalPrice = ComputeRenewalPrice(basePrice, course.RenewalPercentage);
        return new RenewalOfferSnapshot(basePrice, renewalPrice, course.RenewalPercentage);
    }

    public static int ComputeRenewalPrice(int basePrice, byte renewalPercentage)
    {
        if (basePrice < 1)
            return 1;
        if (renewalPercentage >= 100)
            return 1;

        var discounted = (int)Math.Round(
            basePrice * (100 - renewalPercentage) / 100.0,
            MidpointRounding.AwayFromZero);
        return Math.Max(1, discounted);
    }

    public async Task MarkRenewalOffersUsedAsync(
        Guid customerId,
        Course purchasedCourse,
        DateTime utcNow,
        CancellationToken cancellationToken)
    {
        var targetCourseIds = await ResolveEnrollmentCourseIdsAsync(purchasedCourse, cancellationToken);
        if (targetCourseIds.Count == 0)
            return;

        var windowEnd = utcNow.AddDays(RenewalWindowDays);
        var enrollments = await _db.CourseEnrollments
            .Where(e => e.CustomerId == customerId
                        && targetCourseIds.Contains(e.CourseId)
                        && e.RenewalOfferEligibleFlag
                        && !e.RenewalOfferUsedFlag
                        && e.AccessExpiryDate <= windowEnd)
            .ToListAsync(cancellationToken);

        foreach (var enrollment in enrollments)
        {
            enrollment.RenewalOfferUsedFlag = true;
            enrollment.UpdatedAt = utcNow;
        }
    }

    public async Task<DateTime> ResolveRenewalAccessExpiryAsync(
        Guid customerId,
        IReadOnlyList<Guid> targetCourseIds,
        int accessDays,
        DateTime utcNow,
        CancellationToken cancellationToken)
    {
        if (targetCourseIds.Count == 0)
            return utcNow.AddDays(accessDays);

        var latest = await _db.CourseEnrollments
            .AsNoTracking()
            .Where(e => e.CustomerId == customerId && targetCourseIds.Contains(e.CourseId))
            .Select(e => (DateTime?)e.AccessExpiryDate)
            .MaxAsync(cancellationToken);

        var startFrom = latest.HasValue && latest.Value > utcNow ? latest.Value : utcNow;
        return startFrom.AddDays(accessDays);
    }

    private async Task<IReadOnlyList<Guid>> ResolveEnrollmentCourseIdsAsync(
        Course course,
        CancellationToken cancellationToken)
    {
        if (course.Type != CourseType.Bundle)
            return [course.Id];

        var items = course.BundleItems;
        if (items is null || items.Count == 0)
        {
            items = await _db.CourseBundleItems
                .AsNoTracking()
                .Where(b => b.BundleCourseId == course.Id)
                .ToListAsync(cancellationToken);
        }

        return items.Select(b => b.IncludedCourseId).Distinct().ToList();
    }

    private async Task<int> ResolveRenewalBasePriceAsync(Course course, CancellationToken cancellationToken)
    {
        if (course.Type != CourseType.Bundle)
            return course.Price;

        var offer = course.LaunchOffer
            ?? await _db.LaunchOfferCounters
                .AsNoTracking()
                .SingleOrDefaultAsync(x => x.CourseId == course.Id, cancellationToken);

        return offer?.RegularPriceAfterLaunch ?? course.Price;
    }

    private async Task<(int Price, bool LaunchActive, int? Remaining)> ResolveLaunchPriceAsync(
        Course course,
        CancellationToken cancellationToken)
    {
        if (course.Type != CourseType.Bundle)
            return (course.Price, false, null);

        var offer = course.LaunchOffer
            ?? await _db.LaunchOfferCounters
                .AsNoTracking()
                .SingleOrDefaultAsync(x => x.CourseId == course.Id, cancellationToken);

        if (offer is null)
            return (course.Price, false, null);

        var remaining = Math.Max(0, offer.LaunchLimit - offer.CompletedPurchaseCount);
        if (remaining > 0)
            return (offer.LaunchPrice, true, remaining);

        return (offer.RegularPriceAfterLaunch, false, 0);
    }
}

public sealed record RenewalOfferSnapshot(int BasePrice, int RenewalPrice, byte Percentage);
