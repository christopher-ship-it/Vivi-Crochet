using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using VIVI.Api.DTOs.Customers;
using VIVI.Api.DTOs.Enrollments;
using VIVI.Api.Extensions;
using VIVI.Api.Mapping;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Auth;
using VIVI.Infrastructure.Commerce;
using VIVI.Infrastructure.Configuration;
using VIVI.Infrastructure.Data;
using VIVI.Infrastructure.Email.Templates;

namespace VIVI.Api.Controllers;

[ApiController]
[Route("api/me")]
[Authorize(Roles = nameof(UserRole.Customer))]
public sealed class MeController : ControllerBase
{
    public const string TestEmailVerificationCode = "123456";

    private readonly ViviDbContext _db;
    private readonly CustomerResolver _customers;
    private readonly AdminDataCleanupService _cleanup;
    private readonly IEmailService _email;
    private readonly TwoFactorOptions _twoFactor;
    private readonly IHostEnvironment _env;
    private readonly ILogger<MeController> _logger;

    public MeController(
        ViviDbContext db,
        CustomerResolver customers,
        AdminDataCleanupService cleanup,
        IEmailService email,
        IOptions<TwoFactorOptions> twoFactor,
        IHostEnvironment env,
        ILogger<MeController> logger)
    {
        _db = db;
        _customers = customers;
        _cleanup = cleanup;
        _email = email;
        _twoFactor = twoFactor.Value;
        _env = env;
        _logger = logger;
    }

    /// <summary>Returns the authenticated customer's profile used for orders and emails.</summary>
    [HttpGet("profile")]
    [ProducesResponseType(typeof(CustomerProfileResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<CustomerProfileResponse>> GetProfile(CancellationToken cancellationToken)
    {
        var customer = await _customers.ResolveForUserAsync(User.GetUserId(), cancellationToken);
        return Ok(ToProfileDto(customer));
    }

    /// <summary>Permanently deletes the authenticated customer account and related commerce data.</summary>
    [HttpDelete("account")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> DeleteAccount(CancellationToken cancellationToken)
    {
        var customer = await _customers.ResolveForUserAsync(User.GetUserId(), cancellationToken);
        await _cleanup.DeleteCustomerAsync(customer.Id, cancellationToken);
        return NoContent();
    }

    /// <summary>Updates name/phone and optional saved delivery address for checkout prefills.</summary>
    [HttpPut("profile")]
    [ProducesResponseType(typeof(CustomerProfileResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<CustomerProfileResponse>> UpdateProfile(
        [FromBody] UpdateCustomerProfileRequest request,
        CancellationToken cancellationToken)
    {
        ShippingAddressInput? shipping = null;
        string? addressTag = null;
        if (request.ShippingAddress is not null)
        {
            shipping = ToShippingInput(request.ShippingAddress);
            OrderCheckoutService.ValidateShipping(shipping, request.ShippingAddress.Country);
            addressTag = NormalizeAddressTag(request.ShippingAddress.Tag);
        }

        var customer = await _customers.UpdateProfileAsync(
            User.GetUserId(),
            request.FullName,
            request.Email,
            request.PhoneNumber,
            shipping,
            cancellationToken,
            addressTag,
            request.Age,
            request.State,
            request.City,
            request.ShippingAddress?.Country);

        return Ok(ToProfileDto(customer));
    }

    /// <summary>Sends a 6-digit code to prove ownership of a communication email.</summary>
    [HttpPost("email/verify/request")]
    [EnableRateLimiting("login")]
    [ProducesResponseType(typeof(RequestEmailVerificationResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<RequestEmailVerificationResponse>> RequestEmailVerification(
        [FromBody] RequestEmailVerificationRequest request,
        CancellationToken cancellationToken)
    {
        var customer = await _customers.ResolveForUserAsync(User.GetUserId(), cancellationToken);
        var email = CustomerAccountService.NormalizeEmail(request.Email);
        var expiryMinutes = Math.Max(5, _twoFactor.OtpExpiryMinutes);
        var now = DateTime.UtcNow;
        var expiresAt = now.AddMinutes(expiryMinutes);

        if (email.EndsWith("@vivicrochet.dev", StringComparison.OrdinalIgnoreCase))
            throw new ViviException("INVALID_EMAIL", "Enter a real email address for order updates.");

        await _cleanup.FreeEmailForReuseAsync(email, cancellationToken, keepUserId: customer.UserId);

        var emailTakenByCustomer = await _db.Customers.AnyAsync(
            c => c.Id != customer.Id && c.Email == email,
            cancellationToken);
        var emailTakenByUser = await _db.AdminUsers.AnyAsync(
            u => u.Id != customer.UserId && u.Email == email,
            cancellationToken);
        if (emailTakenByCustomer || emailTakenByUser)
        {
            throw ViviException.Conflict(
                "EMAIL_IN_USE",
                "That email is already registered. Sign in with it, or use a different email.");
        }

        var message = "We sent a verification code to that email.";

        // Debounce duplicate taps / double effects: reuse a fresh unused challenge
        // instead of sending a second OTP email within the cooldown window.
        const int resendCooldownSeconds = 60;
        var recent = await _db.EmailVerificationChallenges
            .Where(c =>
                c.CustomerId == customer.Id
                && c.Email == email
                && c.VerifiedAt == null
                && c.ExpiresAt > now)
            .OrderByDescending(c => c.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (recent is not null && (now - recent.CreatedAt).TotalSeconds < resendCooldownSeconds)
        {
            var remaining = Math.Max(1, (int)(recent.ExpiresAt - now).TotalSeconds);
            return Ok(new RequestEmailVerificationResponse
            {
                ExpiresInSeconds = remaining,
                Message = message
            });
        }

        var code = _env.IsEnvironment("Testing")
            ? TestEmailVerificationCode
            : RandomNumberGenerator.GetInt32(100000, 1000000).ToString();

        var challenge = new EmailVerificationChallenge
        {
            Id = Guid.NewGuid(),
            CustomerId = customer.Id,
            Email = email,
            CodeHash = HashEmailCode(code),
            ExpiresAt = expiresAt,
            AttemptCount = 0,
            CreatedAt = now
        };
        _db.EmailVerificationChallenges.Add(challenge);
        await _db.SaveChangesAsync(cancellationToken);

        if (!_email.IsConfigured)
        {
            _logger.LogWarning("Email verification requested for {Email} but email is not configured.", email);
            return Ok(new RequestEmailVerificationResponse
            {
                ExpiresInSeconds = expiryMinutes * 60,
                Message = message
            });
        }

        var rendered = EmailVerificationEmail.Render(code, expiryMinutes);
        var send = await _email.SendAsync(
            new EmailSendRequest(email, rendered.Subject, rendered.Html, rendered.Text),
            cancellationToken);

        if (!send.Success)
        {
            _logger.LogWarning("Email verification send failed for {Email}: {Error}", email, send.Error);
            throw ViviException.Conflict(
                "EMAIL_SEND_FAILED",
                "Could not send the verification code. Check the address and try again.");
        }

        return Ok(new RequestEmailVerificationResponse
        {
            ExpiresInSeconds = expiryMinutes * 60,
            Message = message
        });
    }

    /// <summary>Confirms the email OTP and saves the verified communication email.</summary>
    [HttpPost("email/verify/confirm")]
    [EnableRateLimiting("login")]
    [ProducesResponseType(typeof(CustomerProfileResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<CustomerProfileResponse>> ConfirmEmailVerification(
        [FromBody] ConfirmEmailVerificationRequest request,
        CancellationToken cancellationToken)
    {
        var customer = await _customers.ResolveForUserAsync(User.GetUserId(), cancellationToken);
        var email = CustomerAccountService.NormalizeEmail(request.Email);
        var code = request.Code.Trim();
        var now = DateTime.UtcNow;

        var challenge = await _db.EmailVerificationChallenges
            .Where(c => c.CustomerId == customer.Id && c.Email == email && c.VerifiedAt == null)
            .OrderByDescending(c => c.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new ViviException("INVALID_CHALLENGE", "Verification code not found. Request a new code.");

        if (challenge.ExpiresAt <= now)
            throw ViviException.Unauthorized("EXPIRED_CHALLENGE", "Verification code expired. Request a new code.");

        if (challenge.AttemptCount >= _twoFactor.MaxAttempts)
            throw ViviException.Unauthorized("TOO_MANY_ATTEMPTS", "Too many attempts. Request a new code.");

        challenge.AttemptCount++;
        var matched = FixedTimeEqualsHex(challenge.CodeHash, HashEmailCode(code));
        if (!matched)
        {
            await _db.SaveChangesAsync(cancellationToken);
            throw new ViviException("INVALID_CODE", "That code is incorrect. Try again.");
        }

        challenge.VerifiedAt = now;
        await _db.SaveChangesAsync(cancellationToken);

        var updated = await _customers.ApplyVerifiedEmailAsync(User.GetUserId(), email, cancellationToken);
        return Ok(ToProfileDto(updated));
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

    /// <summary>
    /// Marks a course enrollment complete (encouragement / journey milestones).
    /// Idempotent when already completed.
    /// </summary>
    [HttpPost("enrollments/{courseId:guid}/complete")]
    [ProducesResponseType(typeof(EnrollmentResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<EnrollmentResponse>> CompleteEnrollment(
        Guid courseId,
        CancellationToken cancellationToken)
    {
        var customer = await _customers.ResolveForUserAsync(User.GetUserId(), cancellationToken);
        var now = DateTime.UtcNow;
        var enrollment = await _db.CourseEnrollments
            .Include(e => e.Course)
            .Where(e => e.CustomerId == customer.Id && e.CourseId == courseId)
            .OrderByDescending(e => e.AccessExpiryDate)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw ViviException.NotFound("ENROLLMENT_NOT_FOUND", "No enrollment was found for this course.");

        if (!enrollment.CompletedFlag)
        {
            enrollment.CompletedFlag = true;
            enrollment.CompletedAt = now;
            enrollment.UpdatedAt = now;
            await _db.SaveChangesAsync(cancellationToken);
        }

        return Ok(enrollment.ToDto(now));
    }

    private static CustomerProfileResponse ToProfileDto(Customer customer)
    {
        var email = customer.Email ?? string.Empty;
        var synthetic = email.EndsWith("@vivicrochet.dev", StringComparison.OrdinalIgnoreCase);
        return new CustomerProfileResponse
        {
            Id = customer.Id,
            FullName = customer.FullName,
            PhoneNumber = customer.PhoneNumber ?? string.Empty,
            Email = synthetic ? string.Empty : email,
            IsEmailVerified = !synthetic && customer.EmailVerifiedAt is not null,
            Age = customer.Age,
            Country = customer.Country,
            State = customer.State,
            City = customer.City,
            AuthMethod = customer.AuthMethod.ToString(),
            ShippingAddress = ToSavedShippingAddress(customer)
        };
    }

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
            PhoneNumber = customer.ShipPhone ?? customer.PhoneNumber ?? string.Empty,
            AddressLine1 = customer.ShipAddressLine1 ?? string.Empty,
            AddressLine2 = customer.ShipAddressLine2,
            Landmark = customer.ShipLandmark,
            Tag = customer.ShipAddressTag,
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
        address.PinCode.Trim(),
        string.IsNullOrWhiteSpace(address.Country) ? null : address.Country.Trim());

    private static string? NormalizeAddressTag(string? tag)
    {
        if (string.IsNullOrWhiteSpace(tag))
            return null;
        var value = tag.Trim();
        return value is "Home" or "Work" or "Other" ? value : null;
    }

    private static string HashEmailCode(string code) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(code.Trim())));

    private static bool FixedTimeEqualsHex(string storedHex, string providedHex)
    {
        try
        {
            var stored = Convert.FromHexString(storedHex);
            var provided = Convert.FromHexString(providedHex);
            return stored.Length == provided.Length
                && CryptographicOperations.FixedTimeEquals(stored, provided);
        }
        catch (FormatException)
        {
            return false;
        }
    }
}
