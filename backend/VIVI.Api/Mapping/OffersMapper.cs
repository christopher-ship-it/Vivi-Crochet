using VIVI.Api.DTOs.Offers;
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
        string? viralProjectThumbnailUrl)
    {
        var remaining = Math.Max(0, offer.LaunchLimit - offer.CompletedPurchaseCount);
        return new FoundingMembershipOfferResponse
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
    }

    public static MyMembershipResponse ToMembershipDto(this LaunchMembership membership, LaunchOfferCounter? offer, DateTime utcNow)
    {
        return new MyMembershipResponse
        {
            IsMember = true,
            MemberNumber = membership.MemberNumber,
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
        decimal revenue)
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
        CustomerName = membership.Customer?.FullName ?? string.Empty,
        CustomerEmail = membership.Customer?.Email ?? string.Empty,
        CustomerPhone = membership.Customer?.PhoneNumber,
        JoinedDate = membership.AccessStartDate,
        ExpiryDate = membership.AccessExpiryDate,
        AmountPaid = membership.Order?.Items
            .Where(i => i.Id == membership.OrderItemId)
            .Select(i => (int)i.TotalAmount)
            .FirstOrDefault() ?? 0,
        OrderNumber = membership.Order?.OrderNumber ?? string.Empty,
        IsActive = membership.AccessExpiryDate > utcNow,
        ViralProjectCourseName = membership.ViralProjectCourse?.Name
    };
}
