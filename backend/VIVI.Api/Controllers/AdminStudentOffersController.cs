using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VIVI.Api.Auth;
using VIVI.Api.DTOs.Offers;
using VIVI.Core;
using VIVI.Core.Entities;
using VIVI.Core.Exceptions;
using VIVI.Infrastructure.Data;

namespace VIVI.Api.Controllers;

/// <summary>Admin side of the student offer: codes, the student price, and the students who joined.</summary>
[ApiController]
[Route("api/admin/student-offers")]
[Authorize(Roles = AuthRoles.Console)]
public sealed class AdminStudentOffersController : ControllerBase
{
    private readonly ViviDbContext _db;

    public AdminStudentOffersController(ViviDbContext db) => _db = db;

    /// <summary>Student price, counts and every code with how often it was used.</summary>
    [HttpGet]
    [ProducesResponseType(typeof(AdminStudentOfferResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminStudentOfferResponse>> Get(CancellationToken cancellationToken)
        => Ok(await BuildAsync(await LoadOfferAsync(cancellationToken), cancellationToken));

    [HttpPut("settings")]
    [ProducesResponseType(typeof(AdminStudentOfferResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminStudentOfferResponse>> UpdateSettings(
        [FromBody] AdminStudentSettingsRequest request,
        CancellationToken cancellationToken)
    {
        if (request.StudentPrice < 1 || request.StudentPrice > 1_000_000)
            throw new ViviException("INVALID_PRICE", "Enter a student price greater than zero.");

        if (request.StudentPriceUsd is decimal usd && (usd <= 0 || usd > 1_000_000m))
            throw new ViviException("INVALID_PRICE", "Enter a dollar student price greater than zero, or leave it empty.");

        var offer = await LoadOfferAsync(cancellationToken);
        offer.StudentPrice = request.StudentPrice;
        offer.UpdatedAt = DateTime.UtcNow;

        // The dollar price lives on the membership's US price row, which is set up on the Launch offer tab.
        var usRow = await _db.CoursePrices
            .SingleOrDefaultAsync(p => p.CourseId == offer.CourseId && p.CountryCode == "US", cancellationToken);
        if (request.StudentPriceUsd is decimal studentUsd)
        {
            if (usRow is null)
                throw ViviException.Conflict(
                    "US_PRICE_REQUIRED",
                    "Turn on US pricing for the membership (Launch offer tab) before setting a dollar student price.");
            usRow.StudentPrice = Math.Round(studentUsd, 2, MidpointRounding.AwayFromZero);
            usRow.UpdatedAt = DateTime.UtcNow;
        }
        else if (usRow is not null)
        {
            usRow.StudentPrice = null;
            usRow.UpdatedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync(cancellationToken);
        return Ok(await BuildAsync(offer, cancellationToken));
    }

    [HttpPost("codes")]
    [ProducesResponseType(typeof(AdminStudentCodeResponse), StatusCodes.Status201Created)]
    public async Task<ActionResult<AdminStudentCodeResponse>> CreateCode(
        [FromBody] AdminStudentCodeRequest request,
        CancellationToken cancellationToken)
    {
        ValidateCodeRequest(request);

        var existing = (await _db.StudentCodes.AsNoTracking().Select(c => c.Code).ToListAsync(cancellationToken))
            .Select(PublicIds.NormalizeStudentCode)
            .ToHashSet();

        string code;
        if (string.IsNullOrWhiteSpace(request.Code))
        {
            do { code = PublicIds.NewStudentCode(); } while (existing.Contains(code));
        }
        else
        {
            code = PublicIds.NormalizeStudentCode(request.Code);
            if (code.Length < 4 || code.Length > 40)
                throw new ViviException("STUDENT_CODE_LENGTH", "A student code must be 4 to 40 letters or numbers.");
            if (existing.Contains(code))
                throw ViviException.Conflict("STUDENT_CODE_EXISTS", "A student code with this name already exists.");
        }

        var now = DateTime.UtcNow;
        var entity = new StudentCode
        {
            Id = Guid.NewGuid(),
            Code = code,
            Label = request.Label.Trim(),
            IsActive = request.IsActive,
            MaxUses = request.MaxUses,
            ExpiresAt = request.ExpiresAt?.ToUniversalTime(),
            CreatedAt = now,
            UpdatedAt = now
        };
        _db.StudentCodes.Add(entity);
        await _db.SaveChangesAsync(cancellationToken);
        return StatusCode(StatusCodes.Status201Created, ToDto(entity, now));
    }

    /// <summary>Edits label, on/off, use limit and expiry. The code text itself never changes.</summary>
    [HttpPut("codes/{id:guid}")]
    [ProducesResponseType(typeof(AdminStudentCodeResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminStudentCodeResponse>> UpdateCode(
        Guid id,
        [FromBody] AdminStudentCodeRequest request,
        CancellationToken cancellationToken)
    {
        ValidateCodeRequest(request);
        var entity = await _db.StudentCodes.SingleOrDefaultAsync(c => c.Id == id, cancellationToken)
            ?? throw ViviException.NotFound("STUDENT_CODE_NOT_FOUND", "Student code was not found.");

        if (request.MaxUses is int max && max < entity.UsedCount)
            throw ViviException.Conflict(
                "MAX_USES_BELOW_USED",
                $"The limit cannot be below the {entity.UsedCount} students who already used this code.");

        entity.Label = request.Label.Trim();
        entity.IsActive = request.IsActive;
        entity.MaxUses = request.MaxUses;
        entity.ExpiresAt = request.ExpiresAt?.ToUniversalTime();
        entity.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        return Ok(ToDto(entity, DateTime.UtcNow));
    }

    /// <summary>Students who joined, with search (name/email/phone/member #/code) and an optional code filter.</summary>
    [HttpGet("members")]
    [ProducesResponseType(typeof(AdminStudentMemberListResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminStudentMemberListResponse>> ListMembers(
        [FromQuery] string? search,
        [FromQuery] Guid? codeId,
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
            .Where(m => m.IsStudent);

        if (codeId.HasValue)
            query = query.Where(m => m.StudentCodeId == codeId);

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
                    (m.Customer!.PhoneNumber ?? "").Contains(term) ||
                    (m.MemberCode ?? "").Contains(term));
            }
        }

        var totalCount = await query.CountAsync(cancellationToken);
        var items = await query
            .OrderBy(m => m.MemberNumber)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        var codeIds = items.Where(m => m.StudentCodeId.HasValue).Select(m => m.StudentCodeId!.Value).Distinct().ToList();
        var codes = await _db.StudentCodes.AsNoTracking()
            .Where(c => codeIds.Contains(c.Id))
            .ToDictionaryAsync(c => c.Id, cancellationToken);

        return Ok(new AdminStudentMemberListResponse
        {
            TotalCount = totalCount,
            Page = page,
            PageSize = pageSize,
            Items = items.Select(m =>
            {
                codes.TryGetValue(m.StudentCodeId ?? Guid.Empty, out var code);
                return new AdminStudentMemberResponse
                {
                    Id = m.Id,
                    MemberNumber = m.MemberNumber,
                    MemberCode = m.MemberCode,
                    CustomerCode = m.Customer?.CustomerCode,
                    CustomerName = m.Customer?.FullName ?? string.Empty,
                    CustomerEmail = m.Customer?.Email ?? string.Empty,
                    CustomerPhone = m.Customer?.PhoneNumber,
                    StudentCode = code?.Code,
                    StudentLabel = code?.Label,
                    JoinedDate = m.AccessStartDate,
                    ExpiryDate = m.AccessExpiryDate,
                    AmountPaid = m.Order?.Items.Where(i => i.Id == m.OrderItemId).Select(i => i.TotalAmount).FirstOrDefault() ?? 0,
                    Currency = m.Order?.Currency ?? "INR",
                    OrderNumber = m.Order?.OrderNumber ?? string.Empty,
                    IsActive = m.AccessExpiryDate > now
                };
            }).ToList()
        });
    }

    private static void ValidateCodeRequest(AdminStudentCodeRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Label))
            throw new ViviException("LABEL_REQUIRED", "Enter who this code is for (for example a college name).");
        if (request.Label.Trim().Length > 120)
            throw new ViviException("LABEL_TOO_LONG", "The label can be at most 120 characters.");
        if (request.MaxUses is < 1)
            throw new ViviException("INVALID_MAX_USES", "The use limit must be at least 1, or left empty for no limit.");
    }

    private async Task<LaunchOfferCounter> LoadOfferAsync(CancellationToken cancellationToken)
        => await _db.LaunchOfferCounters
               .OrderBy(o => o.CreatedAt)
               .FirstOrDefaultAsync(cancellationToken)
           ?? throw ViviException.NotFound("OFFER_NOT_FOUND", "No special offer is configured.");

    private async Task<AdminStudentOfferResponse> BuildAsync(LaunchOfferCounter offer, CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var codes = await _db.StudentCodes.AsNoTracking()
            .OrderByDescending(c => c.CreatedAt)
            .ToListAsync(cancellationToken);

        // Rupee and dollar sales are added up separately.
        var paid = await _db.LaunchMemberships
            .AsNoTracking()
            .Where(m => m.CourseId == offer.CourseId && m.IsStudent)
            .Join(_db.OrderItems, m => m.OrderItemId, i => i.Id, (m, i) => new { i.TotalAmount, i.OrderId })
            .Join(_db.Orders, x => x.OrderId, o => o.Id, (x, o) => new { x.TotalAmount, o.Currency })
            .ToListAsync(cancellationToken);

        var usRow = await _db.CoursePrices
            .AsNoTracking()
            .SingleOrDefaultAsync(p => p.CourseId == offer.CourseId && p.CountryCode == "US", cancellationToken);

        return new AdminStudentOfferResponse
        {
            CourseId = offer.CourseId,
            StudentPrice = offer.StudentPrice,
            StudentPriceUsd = usRow?.StudentPrice,
            UsPriceConfigured = usRow is not null,
            AccessDurationDays = offer.AccessDurationDays,
            EnrolledCount = paid.Count,
            Revenue = paid.Where(x => x.Currency == "INR").Sum(x => x.TotalAmount),
            RevenueUsd = paid.Where(x => x.Currency == "USD").Sum(x => x.TotalAmount),
            Codes = codes.Select(c => ToDto(c, now)).ToList()
        };
    }

    private static AdminStudentCodeResponse ToDto(StudentCode c, DateTime now) => new()
    {
        Id = c.Id,
        Code = c.Code,
        Label = c.Label,
        IsActive = c.IsActive,
        MaxUses = c.MaxUses,
        UsedCount = c.UsedCount,
        ExpiresAt = c.ExpiresAt,
        IsExpired = c.ExpiresAt is DateTime e && e <= now,
        CreatedAt = c.CreatedAt
    };
}
