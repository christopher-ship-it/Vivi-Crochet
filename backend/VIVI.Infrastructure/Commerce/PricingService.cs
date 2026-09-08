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
    int AccessDays);

public sealed class PricingService
{
    private readonly ViviDbContext _db;

    public PricingService(ViviDbContext db) => _db = db;

    public async Task<CoursePricingResult> GetCoursePricingAsync(Guid courseId, CancellationToken cancellationToken)
    {
        var course = await _db.Courses
            .AsNoTracking()
            .Include(c => c.LaunchOffer)
            .SingleOrDefaultAsync(c => c.Id == courseId && c.Status == CourseStatus.Published, cancellationToken)
            ?? throw new KeyNotFoundException("Course was not found.");

        var (price, launchActive, remaining) = await ResolveLaunchPriceAsync(course, cancellationToken);
        var mrp = course.Mrp ?? course.LaunchOffer?.Mrp;
        return new CoursePricingResult(
            course.Id,
            course.Name,
            course.Price,
            mrp,
            price,
            launchActive,
            remaining,
            course.AccessDays);
    }

    public async Task<int> ResolveUnitPriceAsync(Course course, CancellationToken cancellationToken)
    {
        var (price, _, _) = await ResolveLaunchPriceAsync(course, cancellationToken);
        return price;
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
