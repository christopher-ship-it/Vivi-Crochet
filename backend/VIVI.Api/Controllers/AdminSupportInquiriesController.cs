using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VIVI.Api.Auth;
using VIVI.Api.DTOs.Support;
using VIVI.Api.Mapping;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Infrastructure.Data;

namespace VIVI.Api.Controllers;

[ApiController]
[Route("api/admin/support-inquiries")]
[Authorize(Roles = AuthRoles.Console)]
public sealed class AdminSupportInquiriesController : ControllerBase
{
    private readonly ViviDbContext _db;

    public AdminSupportInquiriesController(ViviDbContext db) => _db = db;

    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<AdminSupportInquiryListItemResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<AdminSupportInquiryListItemResponse>>> List(
        CancellationToken cancellationToken)
    {
        var rows = await _db.SupportInquiries
            .AsNoTracking()
            .Include(i => i.Customer)
            .OrderByDescending(i => i.CreatedAt)
            .Take(500)
            .ToListAsync(cancellationToken);

        return Ok(rows.Select(ToDto).ToList());
    }

    [HttpGet("unread-count")]
    [ProducesResponseType(typeof(SupportUnreadCountResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<SupportUnreadCountResponse>> UnreadCount(CancellationToken cancellationToken)
    {
        var count = await _db.SupportInquiries
            .AsNoTracking()
            .CountAsync(i => !i.IsRead, cancellationToken);
        return Ok(new SupportUnreadCountResponse { Count = count });
    }

    [HttpPost("{id:guid}/read")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> MarkRead(Guid id, CancellationToken cancellationToken)
    {
        var inquiry = await _db.SupportInquiries.SingleOrDefaultAsync(i => i.Id == id, cancellationToken)
            ?? throw ViviException.NotFound("SUPPORT_INQUIRY_NOT_FOUND", "Support inquiry was not found.");

        if (!inquiry.IsRead)
        {
            inquiry.IsRead = true;
            await _db.SaveChangesAsync(cancellationToken);
        }

        return NoContent();
    }

    private static AdminSupportInquiryListItemResponse ToDto(Core.Entities.SupportInquiry inquiry)
    {
        var customer = inquiry.Customer;
        var email = customer?.Email?.Trim() ?? string.Empty;
        if (email.EndsWith("@vivicrochet.dev", StringComparison.OrdinalIgnoreCase))
            email = string.Empty;

        return new AdminSupportInquiryListItemResponse
        {
            Id = inquiry.Id,
            CustomerId = inquiry.CustomerId,
            CustomerName = CommerceMapper.DisplayCustomerName(customer),
            PhoneNumber = customer?.PhoneNumber ?? string.Empty,
            Email = email,
            Message = inquiry.Message,
            CreatedAt = inquiry.CreatedAt,
            IsRead = inquiry.IsRead
        };
    }
}
