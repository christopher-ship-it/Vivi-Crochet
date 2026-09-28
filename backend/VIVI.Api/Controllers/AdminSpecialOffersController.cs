using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VIVI.Api.Auth;
using VIVI.Api.DTOs.Offers;
using VIVI.Api.Mapping;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Infrastructure.Data;

namespace VIVI.Api.Controllers;

[ApiController]
[Route("api/admin/special-offers")]
[Authorize(Roles = AuthRoles.Console)]
public sealed class AdminSpecialOffersController : ControllerBase
{
    private readonly ViviDbContext _db;

    public AdminSpecialOffersController(ViviDbContext db) => _db = db;

    /// <summary>Lists all configured launch-offer/founding-membership programs (today: one, tied to the bundle course).</summary>
    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<AdminSpecialOfferResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<AdminSpecialOfferResponse>>> List(CancellationToken cancellationToken)
    {
        var offers = await _db.LaunchOfferCounters
            .AsNoTracking()
            .Include(o => o.ViralProjectCourse)
            .OrderBy(o => o.CreatedAt)
            .ToListAsync(cancellationToken);

        var dtos = new List<AdminSpecialOfferResponse>();
        foreach (var offer in offers)
            dtos.Add(await BuildDtoAsync(offer, cancellationToken));

        return Ok(dtos);
    }

    [HttpGet("{courseId:guid}")]
    [ProducesResponseType(typeof(AdminSpecialOfferResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminSpecialOfferResponse>> Get(Guid courseId, CancellationToken cancellationToken)
    {
        var offer = await LoadAsync(courseId, cancellationToken);
        return Ok(await BuildDtoAsync(offer, cancellationToken));
    }

    [HttpPut("{courseId:guid}")]
    [ProducesResponseType(typeof(AdminSpecialOfferResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminSpecialOfferResponse>> Update(
        Guid courseId,
        [FromBody] AdminSpecialOfferRequest request,
        CancellationToken cancellationToken)
    {
        var offer = await LoadAsync(courseId, cancellationToken);

        if (request.LaunchLimit < offer.CompletedPurchaseCount)
            throw ViviException.Conflict(
                "LIMIT_BELOW_ENROLLED",
                $"Maximum members cannot be set below the {offer.CompletedPurchaseCount} members already enrolled.");

        if (request.ViralProjectCourseId.HasValue)
        {
            var isProjectCourse = await _db.Courses.AnyAsync(
                c => c.Id == request.ViralProjectCourseId && c.Type == CourseType.ProjectCourse,
                cancellationToken);
            if (!isProjectCourse)
                throw ViviException.NotFound("VIRAL_PROJECT_NOT_FOUND", "Selected viral project was not found.");
        }

        offer.OfferName = string.IsNullOrWhiteSpace(request.OfferName) ? offer.OfferName : request.OfferName.Trim();
        offer.IsActive = request.IsActive;
        offer.LaunchPrice = request.LaunchPrice;
        offer.LaunchLimit = request.LaunchLimit;
        offer.RegularPriceAfterLaunch = request.RegularPriceAfterLaunch;
        offer.Mrp = request.Mrp;
        offer.AccessDurationDays = request.AccessDurationDays > 0 ? request.AccessDurationDays : offer.AccessDurationDays;
        offer.ViralProjectCourseId = request.ViralProjectCourseId;
        offer.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(cancellationToken);
        offer = await LoadAsync(courseId, cancellationToken);
        return Ok(await BuildDtoAsync(offer, cancellationToken));
    }

    /// <summary>Founding members list with search (name/email/phone/member #) and active/expired filter.</summary>
    [HttpGet("{courseId:guid}/members")]
    [ProducesResponseType(typeof(AdminFoundingMemberListResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminFoundingMemberListResponse>> ListMembers(
        Guid courseId,
        [FromQuery] string? search,
        [FromQuery] string? status,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        CancellationToken cancellationToken = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);
        var now = DateTime.UtcNow;

        var query = _db.LaunchMemberships
            .AsNoTracking()
            .Include(m => m.Customer)
            .Include(m => m.Order).ThenInclude(o => o!.Items)
            .Include(m => m.ViralProjectCourse)
            .Where(m => m.CourseId == courseId);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            if (int.TryParse(term.TrimStart('#'), out var memberNumber))
            {
                query = query.Where(m => m.MemberNumber == memberNumber);
            }
            else
            {
                query = query.Where(m =>
                    (m.Customer!.FullName ?? "").Contains(term) ||
                    (m.Customer!.Email ?? "").Contains(term) ||
                    (m.Customer!.PhoneNumber ?? "").Contains(term));
            }
        }

        if (string.Equals(status, "active", StringComparison.OrdinalIgnoreCase))
            query = query.Where(m => m.AccessExpiryDate > now);
        else if (string.Equals(status, "expired", StringComparison.OrdinalIgnoreCase))
            query = query.Where(m => m.AccessExpiryDate <= now);

        var totalCount = await query.CountAsync(cancellationToken);
        var items = await query
            .OrderBy(m => m.MemberNumber)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return Ok(new AdminFoundingMemberListResponse
        {
            TotalCount = totalCount,
            Page = page,
            PageSize = pageSize,
            Items = items.Select(m => m.ToAdminListItem(now)).ToList()
        });
    }

    private async Task<Core.Entities.LaunchOfferCounter> LoadAsync(Guid courseId, CancellationToken cancellationToken)
        => await _db.LaunchOfferCounters
               .Include(o => o.ViralProjectCourse)
               .SingleOrDefaultAsync(o => o.CourseId == courseId, cancellationToken)
           ?? throw ViviException.NotFound("OFFER_NOT_FOUND", "No special offer is configured for this course.");

    private async Task<AdminSpecialOfferResponse> BuildDtoAsync(Core.Entities.LaunchOfferCounter offer, CancellationToken cancellationToken)
    {
        var includedCourseIds = await _db.CourseBundleItems
            .AsNoTracking()
            .Where(b => b.BundleCourseId == offer.CourseId)
            .OrderBy(b => b.SortOrder)
            .Select(b => b.IncludedCourseId)
            .ToListAsync(cancellationToken);

        var includedCourses = await _db.Courses
            .AsNoTracking()
            .Where(c => includedCourseIds.Contains(c.Id))
            .ToListAsync(cancellationToken);

        var revenue = await _db.LaunchMemberships
            .AsNoTracking()
            .Where(m => m.CourseId == offer.CourseId)
            .Join(_db.OrderItems, m => m.OrderItemId, i => i.Id, (m, i) => i.TotalAmount)
            .SumAsync(cancellationToken);

        return offer.ToAdminDto(includedCourses, revenue);
    }
}
