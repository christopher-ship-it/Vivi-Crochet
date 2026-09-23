using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VIVI.Api.Auth;
using VIVI.Api.DTOs.Customers;
using VIVI.Api.Mapping;
using VIVI.Core.Enums;
using VIVI.Infrastructure.Commerce;
using VIVI.Infrastructure.Data;

namespace VIVI.Api.Controllers;

/// <summary>Admin view of mobile app customers (anyone who signed in via phone OTP).</summary>
[ApiController]
[Route("api/admin/customers")]
[Authorize(Roles = AuthRoles.Console)]
public sealed class AdminCustomersController : ControllerBase
{
    private readonly ViviDbContext _db;
    private readonly AdminDataCleanupService _cleanup;

    public AdminCustomersController(ViviDbContext db, AdminDataCleanupService cleanup)
    {
        _db = db;
        _cleanup = cleanup;
    }

    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<AdminCustomerListItemResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<AdminCustomerListItemResponse>>> List(
        [FromQuery] string? q,
        CancellationToken cancellationToken)
    {
        var query = _db.Customers
            .AsNoTracking()
            .Include(c => c.User)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim().ToLowerInvariant();
            query = query.Where(c =>
                c.FullName.ToLower().Contains(term)
                || (c.PhoneNumber != null && c.PhoneNumber.Contains(term))
                || (c.Email != null && c.Email.ToLower().Contains(term))
                || (c.ShipFullName != null && c.ShipFullName.ToLower().Contains(term)));
        }

        var customers = await query
            .OrderByDescending(c => c.UpdatedAt)
            .ThenByDescending(c => c.CreatedAt)
            .Take(500)
            .ToListAsync(cancellationToken);

        var customerIds = customers.Select(c => c.Id).ToList();
        var orderCounts = await _db.Orders
            .AsNoTracking()
            .Where(o => customerIds.Contains(o.CustomerId))
            .GroupBy(o => o.CustomerId)
            .Select(g => new { CustomerId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.CustomerId, x => x.Count, cancellationToken);

        return Ok(customers.Select(c =>
        {
            var email = c.Email?.Trim() ?? string.Empty;
            var isSynthetic = email.EndsWith("@vivicrochet.dev", StringComparison.OrdinalIgnoreCase);
            return new AdminCustomerListItemResponse
            {
                Id = c.Id,
                FullName = CommerceMapper.DisplayCustomerName(c),
                PhoneNumber = c.PhoneNumber ?? string.Empty,
                Email = isSynthetic ? string.Empty : email,
                IsActive = c.IsActive && (c.User?.IsActive ?? true),
                SignedUpAt = c.CreatedAt,
                LastActiveAt = c.UpdatedAt > (c.User?.UpdatedAt ?? DateTime.MinValue)
                    ? c.UpdatedAt
                    : (c.User?.UpdatedAt ?? c.UpdatedAt),
                OrderCount = orderCounts.GetValueOrDefault(c.Id),
                Track = c.AuthMethod == CustomerAuthMethod.EmailPassword ? "International" : "India",
                Age = c.Age,
                Country = string.IsNullOrWhiteSpace(c.Country) ? null : c.Country.Trim(),
                State = string.IsNullOrWhiteSpace(c.State) ? null : c.State.Trim(),
                City = string.IsNullOrWhiteSpace(c.City) ? null : c.City.Trim(),
            };
        }).ToList());
    }

    /// <summary>
    /// Permanently deletes the customer, login account, orders, enrollments, bookings, and support queries.
    /// </summary>
    [HttpDelete("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        await _cleanup.DeleteCustomerAsync(id, cancellationToken);
        return NoContent();
    }
}
