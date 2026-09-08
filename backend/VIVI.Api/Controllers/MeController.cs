using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VIVI.Api.DTOs.Customers;
using VIVI.Api.DTOs.Enrollments;
using VIVI.Api.Extensions;
using VIVI.Api.Mapping;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Commerce;
using VIVI.Infrastructure.Data;

namespace VIVI.Api.Controllers;

[ApiController]
[Route("api/me")]
[Authorize(Roles = nameof(UserRole.Customer))]
public sealed class MeController : ControllerBase
{
    private readonly ViviDbContext _db;
    private readonly CustomerResolver _customers;

    public MeController(ViviDbContext db, CustomerResolver customers)
    {
        _db = db;
        _customers = customers;
    }

    /// <summary>Returns the authenticated customer's profile used for orders and emails.</summary>
    [HttpGet("profile")]
    [ProducesResponseType(typeof(CustomerProfileResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<CustomerProfileResponse>> GetProfile(CancellationToken cancellationToken)
    {
        var customer = await _customers.ResolveForUserAsync(User.GetUserId(), cancellationToken);
        return Ok(ToProfileDto(customer));
    }

    /// <summary>Updates name/email and optional saved delivery address for checkout prefills.</summary>
    [HttpPut("profile")]
    [ProducesResponseType(typeof(CustomerProfileResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<CustomerProfileResponse>> UpdateProfile(
        [FromBody] UpdateCustomerProfileRequest request,
        CancellationToken cancellationToken)
    {
        ShippingAddressInput? shipping = null;
        if (request.ShippingAddress is not null)
        {
            shipping = ToShippingInput(request.ShippingAddress);
            OrderCheckoutService.ValidateShipping(shipping);
        }

        var customer = await _customers.UpdateProfileAsync(
            User.GetUserId(),
            request.FullName,
            request.Email,
            shipping,
            cancellationToken);

        return Ok(ToProfileDto(customer));
    }

    /// <summary>Returns the authenticated customer's course enrollments.</summary>
    [HttpGet("enrollments")]
    [ProducesResponseType(typeof(IReadOnlyList<EnrollmentResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<EnrollmentResponse>>> ListEnrollments(CancellationToken cancellationToken)
    {
        var customer = await _customers.ResolveForUserAsync(User.GetUserId(), cancellationToken);
        var now = DateTime.UtcNow;
        var enrollments = await _db.CourseEnrollments
            .AsNoTracking()
            .Include(e => e.Course)
            .Where(e => e.CustomerId == customer.Id)
            .OrderByDescending(e => e.PurchaseDate)
            .ToListAsync(cancellationToken);

        return Ok(enrollments.Select(e => e.ToDto(now)).ToList());
    }

    /// <summary>Returns one enrollment for a specific course.</summary>
    [HttpGet("enrollments/{courseId:guid}")]
    [ProducesResponseType(typeof(EnrollmentResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<EnrollmentResponse>> GetEnrollment(Guid courseId, CancellationToken cancellationToken)
    {
        var customer = await _customers.ResolveForUserAsync(User.GetUserId(), cancellationToken);
        var now = DateTime.UtcNow;
        var enrollment = await _db.CourseEnrollments
            .AsNoTracking()
            .Include(e => e.Course)
            .Where(e => e.CustomerId == customer.Id && e.CourseId == courseId)
            .OrderByDescending(e => e.AccessExpiryDate)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw ViviException.NotFound("ENROLLMENT_NOT_FOUND", "No enrollment was found for this course.");

        return Ok(enrollment.ToDto(now));
    }

    private static CustomerProfileResponse ToProfileDto(Customer customer) => new()
    {
        Id = customer.Id,
        FullName = customer.FullName,
        PhoneNumber = customer.PhoneNumber,
        Email = customer.Email,
        ShippingAddress = ToSavedShippingAddress(customer)
    };

    private static SavedShippingAddressResponse? ToSavedShippingAddress(Customer customer)
    {
        if (string.IsNullOrWhiteSpace(customer.ShipAddressLine1)
            || string.IsNullOrWhiteSpace(customer.ShipCity)
            || string.IsNullOrWhiteSpace(customer.ShipState)
            || string.IsNullOrWhiteSpace(customer.ShipPinCode))
        {
            return null;
        }

        return new SavedShippingAddressResponse
        {
            FullName = customer.ShipFullName ?? customer.FullName,
            PhoneNumber = customer.ShipPhone ?? customer.PhoneNumber,
            AddressLine1 = customer.ShipAddressLine1 ?? string.Empty,
            AddressLine2 = customer.ShipAddressLine2,
            Landmark = customer.ShipLandmark,
            City = customer.ShipCity ?? string.Empty,
            State = customer.ShipState ?? string.Empty,
            PinCode = customer.ShipPinCode ?? string.Empty,
            Country = string.IsNullOrWhiteSpace(customer.ShipCountry) ? "India" : customer.ShipCountry
        };
    }

    private static ShippingAddressInput ToShippingInput(SavedShippingAddressRequest address) => new(
        address.FullName.Trim(),
        address.PhoneNumber.Trim(),
        address.AddressLine1.Trim(),
        string.IsNullOrWhiteSpace(address.AddressLine2) ? null : address.AddressLine2.Trim(),
        string.IsNullOrWhiteSpace(address.Landmark) ? null : address.Landmark.Trim(),
        address.City.Trim(),
        address.State.Trim(),
        address.PinCode.Trim());
}
