using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VIVI.Api.DTOs.Offers;
using VIVI.Api.Mapping;
using VIVI.Api.Services;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Data;

namespace VIVI.Api.Controllers;

[ApiController]
[Route("api/offers")]
public sealed class OffersController : ControllerBase
{
    private readonly ViviDbContext _db;
    private readonly IBlobStorageService _blob;
    private readonly ILogger<OffersController> _logger;

    public OffersController(ViviDbContext db, IBlobStorageService blob, ILogger<OffersController> logger)
    {
        _db = db;
        _blob = blob;
        _logger = logger;
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

        return Ok(offer.ToOfferDto(includedCourses, viralProjectThumbnail));
    }
}
