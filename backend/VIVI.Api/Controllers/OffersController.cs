using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VIVI.Api.DTOs.Offers;
using VIVI.Api.Extensions;
using VIVI.Api.Mapping;
using VIVI.Api.Services;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Commerce;
using VIVI.Infrastructure.Data;

namespace VIVI.Api.Controllers;

[ApiController]
[Route("api/offers")]
public sealed class OffersController : ControllerBase
{
    private readonly ViviDbContext _db;
    private readonly IBlobStorageService _blob;
    private readonly MarketResolver _markets;
    private readonly ILogger<OffersController> _logger;
    private readonly LaunchOfferService _launchOffers;
    private readonly CustomerResolver _customers;

    public OffersController(
        ViviDbContext db,
        IBlobStorageService blob,
        MarketResolver markets,
        ILogger<OffersController> logger,
        LaunchOfferService launchOffers,
        CustomerResolver customers)
    {
        _db = db;
        _markets = markets;
        _blob = blob;
        _logger = logger;
        _launchOffers = launchOffers;
        _customers = customers;
    }

    /// <summary>Checks a student code before checkout and returns the student price it unlocks.</summary>
    [HttpPost("student-code/validate")]
    [Authorize(Roles = nameof(UserRole.Customer))]
    [ProducesResponseType(typeof(ValidateStudentCodeResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<ValidateStudentCodeResponse>> ValidateStudentCode(
        [FromBody] ValidateStudentCodeRequest request,
        CancellationToken cancellationToken)
    {
        var customer = await _customers.ResolveForUserAsync(User.GetUserId(), cancellationToken);
        var market = await _markets.ResolveAsync(User, Request, cancellationToken);

        await _launchOffers.ResolveStudentCodeOrThrowAsync(request.Code, customer.Id, cancellationToken);

        var offer = await _db.LaunchOfferCounters
            .AsNoTracking()
            .Include(o => o.Course)
            .Where(o => o.Course!.Status == CourseStatus.Published)
            .OrderBy(o => o.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw ViviException.NotFound("OFFER_NOT_FOUND", "No launch offer is configured.");

        var price = await _launchOffers.GetStudentPriceOrThrowAsync(offer.CourseId, market, cancellationToken);
        return Ok(new ValidateStudentCodeResponse
        {
            Price = price,
            Currency = market.Currency,
            AccessDurationDays = offer.AccessDurationDays
        });
    }

    /// <summary>Server-authoritative state of the ₹999 Launch Offer / Founding Membership. Nothing here is hardcoded on the client.</summary>
    [HttpGet("founding-membership")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(FoundingMembershipOfferResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<FoundingMembershipOfferResponse>> GetFoundingMembershipOffer(CancellationToken cancellationToken)
    {
        var offer = await _db.LaunchOfferCounters
            .AsNoTracking()
            .Include(o => o.Course)
            .Include(o => o.ViralProjectCourse)
            .Where(o => o.Course!.Status == CourseStatus.Published)
            .OrderBy(o => o.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw ViviException.NotFound("OFFER_NOT_FOUND", "No launch offer is configured.");

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
        includedCourses = includedCourseIds
            .Select(id => includedCourses.SingleOrDefault(c => c.Id == id))
            .Where(c => c is not null)
            .Select(c => c!)
            .ToList();

        string? viralProjectThumbnail = null;
        if (offer.ViralProjectCourse is not null)
        {
            try
            {
                viralProjectThumbnail = await ProductImageResolver.ResolveAsync(
                    offer.ViralProjectCourse.ThumbnailUrl, _blob, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to resolve viral project thumbnail for offer {CourseId}", offer.CourseId);
            }
        }

        var market = await _markets.ResolveAsync(User, Request, cancellationToken);
        IReadOnlyList<CoursePrice>? marketPrices = null;
        if (!market.UsesBasePrices)
        {
            var ids = includedCourseIds.Append(offer.CourseId).ToList();
            marketPrices = await _db.CoursePrices
                .AsNoTracking()
                .Where(p => p.CountryCode == market.CountryCode && ids.Contains(p.CourseId))
                .ToListAsync(cancellationToken);
        }

        return Ok(offer.ToOfferDto(includedCourses, viralProjectThumbnail, market, marketPrices));
    }
}
