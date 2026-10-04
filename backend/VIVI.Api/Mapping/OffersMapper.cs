using VIVI.Api.DTOs.Offers;
using VIVI.Core;
using VIVI.Core.Entities;

namespace VIVI.Api.Mapping;

public static class OffersMapper
{
    private static readonly string[] BenefitLines =
    [
        "1-year access",
        "Foundation Course",
        "Signature Course",
        "Master Course",
        "1 Viral Project FREE",
        "Founding Member Badge"
    ];

    public static FoundingMembershipOfferResponse ToOfferDto(
        this LaunchOfferCounter offer,
        IReadOnlyList<Course> includedCourses,
        string? viralProjectThumbnailUrl,
        Market? market = null,
        IReadOnlyList<CoursePrice>? marketPrices = null)
    {
        var remaining = Math.Max(0, offer.LaunchLimit - offer.CompletedPurchaseCount);
        var dto = new FoundingMembershipOfferResponse
        {
            CourseId = offer.CourseId,
            OfferName = offer.OfferName,
            PriceLabel = offer.PriceLabel,
            BadgeText = offer.BadgeText,
            EndedBadgeText = offer.EndedBadgeText,
            IsActive = offer.IsActive,
            LaunchPrice = offer.LaunchPrice,
            RegularPriceAfterLaunch = offer.RegularPriceAfterLaunch,
            Mrp = offer.Mrp,
            LaunchLimit = offer.LaunchLimit,
            CompletedPurchaseCount = offer.CompletedPurchaseCount,
            Remaining = offer.IsActive ? remaining : 0,
            AccessDurationDays = offer.AccessDurationDays,
            // Callers pass the courses already in the order the admin saved them.
            IncludedCourses = includedCourses
                .Select(c => new FoundingMembershipCourseResponse { Id = c.Id, Name = c.Name, RegularPrice = c.Price })
                .ToList(),
            ViralProject = offer.ViralProjectCourse is null
                ? null
                : new FoundingMembershipViralProjectResponse
                {
                    Id = offer.ViralProjectCourse.Id,
                    Name = offer.ViralProjectCourse.Name,
                    ThumbnailUrl = viralProjectThumbnailUrl
                },
            Benefits = BenefitLines
        };

        if (market is { UsesBasePrices: false })
        {
            // Another country: show that country's prices. No price row = not sold there.
            var rows = marketPrices ?? [];
            var bundleRow = rows.SingleOrDefault(p => p.CourseId == offer.CourseId);
            dto.Currency = market.Currency;
            dto.AvailableInMarket = bundleRow is not null;
            dto.LaunchPrice = bundleRow?.LaunchPrice ?? 0;
            dto.RegularPriceAfterLaunch = bundleRow?.RegularPriceAfterLaunch ?? bundleRow?.Price ?? 0;
            dto.Mrp = bundleRow?.Mrp ?? 0;
            // Without a launch price for this country the launch offer is not on for them.
            if (bundleRow?.LaunchPrice is null)
                dto.Remaining = 0;
            foreach (var included in dto.IncludedCourses)
                included.RegularPrice = rows.SingleOrDefault(p => p.CourseId == included.Id)?.Price ?? 0;
        }

        return dto;
    }

    public static MyMembershipResponse ToMembershipDto(this LaunchMembership membership, LaunchOfferCounter? offer, DateTime utcNow)
    {
        return new MyMembershipResponse
        {
            IsMember = true,
            MemberNumber = membership.MemberNumber,
            MemberCode = membership.MemberCode,
            IsStudent = membership.IsStudent,
            OfferName = offer?.OfferName,
            BadgeGrantedAt = membership.BadgeGrantedAt,
            AccessExpiryDate = membership.AccessExpiryDate,
            IsActive = membership.AccessExpiryDate > utcNow,
            ViralProject = membership.ViralProjectCourse is null
                ? null
                : new FoundingMembershipViralProjectResponse
                {
                    Id = membership.ViralProjectCourse.Id,
                    Name = membership.ViralProjectCourse.Name
                }
        };
    }

    public static AdminSpecialOfferResponse ToAdminDto(
        this LaunchOfferCounter offer,
        IReadOnlyList<Course> includedCourses,
        decimal revenue,
        decimal revenueUsd = 0,
        CoursePrice? usPrice = null)
    {
        var remaining = Math.Max(0, offer.LaunchLimit - offer.CompletedPurchaseCount);
        return new AdminSpecialOfferResponse
        {
            CourseId = offer.CourseId,
            OfferName = offer.OfferName,
            PriceLabel = offer.PriceLabel,
            BadgeText = offer.BadgeText,
            EndedBadgeText = offer.EndedBadgeText,
            IsActive = offer.IsActive,
            LaunchPrice = offer.LaunchPrice,
            LaunchLimit = offer.LaunchLimit,
            RegularPriceAfterLaunch = offer.RegularPriceAfterLaunch,
            Mrp = offer.Mrp,
            AccessDurationDays = offer.AccessDurationDays,
            CompletedPurchaseCount = offer.CompletedPurchaseCount,
            Remaining = remaining,
            Revenue = revenue,
            RevenueUsd = revenueUsd,
            UsPrice = usPrice is null
                ? null
                : new AdminSpecialOfferMarketPrice
                {
                    LaunchPrice = usPrice.LaunchPrice ?? 0,
                    RegularPriceAfterLaunch = usPrice.RegularPriceAfterLaunch ?? usPrice.Price,
                    Mrp = usPrice.Mrp ?? 0
                },
            ViralProjectCourseId = offer.ViralProjectCourseId,
            ViralProjectCourseName = offer.ViralProjectCourse?.Name,
            IncludedCourses = includedCourses
                .Select(c => new AdminSpecialOfferCourseResponse { Id = c.Id, Name = c.Name, Price = c.Price })
                .ToList()
        };
    }

    public static AdminFoundingMemberListItemResponse ToAdminListItem(this LaunchMembership membership, DateTime utcNow) => new()
    {
        Id = membership.Id,
        MemberNumber = membership.MemberNumber,
        MemberCode = membership.MemberCode,
        CustomerCode = membership.Customer?.CustomerCode,
        CustomerName = membership.Customer?.FullName ?? string.Empty,
        CustomerEmail = membership.Customer?.Email ?? string.Empty,
        CustomerPhone = membership.Customer?.PhoneNumber,
        JoinedDate = membership.AccessStartDate,
        ExpiryDate = membership.AccessExpiryDate,
        AmountPaid = membership.Order?.Items
            .Where(i => i.Id == membership.OrderItemId)
            .Select(i => i.TotalAmount)
            .FirstOrDefault() ?? 0,
        Currency = membership.Order?.Currency ?? "INR",
        OrderNumber = membership.Order?.OrderNumber ?? string.Empty,
        IsActive = membership.AccessExpiryDate > utcNow,
        ViralProjectCourseName = membership.ViralProjectCourse?.Name
    };
}
