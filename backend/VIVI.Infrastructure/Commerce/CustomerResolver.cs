using Microsoft.EntityFrameworkCore;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Auth;
using VIVI.Infrastructure.Data;

namespace VIVI.Infrastructure.Commerce;

public sealed class CustomerResolver
{
    private readonly ViviDbContext _db;
    private readonly AdminDataCleanupService _cleanup;

    public CustomerResolver(ViviDbContext db, AdminDataCleanupService cleanup)
    {
        _db = db;
        _cleanup = cleanup;
    }

    public async Task<Customer> ResolveForUserAsync(Guid userId, CancellationToken cancellationToken)
    {
        var user = await _db.AdminUsers
            .AsNoTracking()
            .SingleOrDefaultAsync(u => u.Id == userId, cancellationToken);

        if (user is null || user.Role != UserRole.Customer || !user.IsActive)
            throw ViviException.Unauthorized(
                "SESSION_INVALID",
                "Please sign in again with your phone number to continue.");

        var existing = await _db.Customers.SingleOrDefaultAsync(c => c.UserId == userId, cancellationToken);
        if (existing is not null)
            return existing;

        var phone = ExtractPhoneFromEmail(user.Email);
        var now = DateTime.UtcNow;
        var customer = new Customer
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            FullName = user.Name,
            PhoneNumber = phone,
            Email = user.Email,
            AuthMethod = phone is null ? CustomerAuthMethod.EmailPassword : CustomerAuthMethod.PhoneOtp,
            Country = phone is null ? null : "India",
            IsActive = true,
            CreatedAt = now,
            UpdatedAt = now
        };

        _db.Customers.Add(customer);
        await _db.SaveChangesAsync(cancellationToken);
        return customer;
    }

    public async Task<Customer> UpdateProfileAsync(
        Guid userId,
        string? fullName,
        string? email,
        string? phoneNumber,
        ShippingAddressInput? shippingAddress,
        CancellationToken cancellationToken,
        string? addressTag = null,
        int? age = null,
        string? state = null,
        string? city = null,
        string? shippingCountry = null)
    {
        var customer = await ResolveForUserAsync(userId, cancellationToken);
        var user = await _db.AdminUsers.SingleOrDefaultAsync(u => u.Id == userId, cancellationToken)
            ?? throw ViviException.Unauthorized(
                "SESSION_INVALID",
                "Please sign in again with your phone number to continue.");

        var changed = false;
        if (!CustomerAccountService.IsPlaceholderName(fullName))
        {
            customer.FullName = fullName!.Trim();
            changed = true;
        }

        if (age is > 0 and <= 120)
        {
            customer.Age = age;
            changed = true;
        }

        if (!string.IsNullOrWhiteSpace(state))
        {
            customer.State = state.Trim();
            if (string.IsNullOrWhiteSpace(customer.Country))
                customer.Country = "India";
            changed = true;
        }

        if (!string.IsNullOrWhiteSpace(city))
        {
            customer.City = city.Trim();
            changed = true;
        }

        if (!string.IsNullOrWhiteSpace(email))
        {
            var normalized = CustomerAccountService.NormalizeEmail(email);
            if (!normalized.Contains('@') || normalized.Length < 5)
                throw new ViviException("INVALID_EMAIL", "Enter a valid email address.");

            if (normalized.EndsWith("@vivicrochet.dev", StringComparison.OrdinalIgnoreCase))
                throw new ViviException("INVALID_EMAIL", "Enter a real email address for order updates.");

            var current = CustomerAccountService.NormalizeEmail(customer.Email);
            var sameEmail = string.Equals(current, normalized, StringComparison.OrdinalIgnoreCase);
            if (!sameEmail || customer.EmailVerifiedAt is null)
            {
                throw ViviException.Conflict(
                    "EMAIL_VERIFICATION_REQUIRED",
                    "Verify this email with the code we send before saving it.");
            }
        }

        if (!string.IsNullOrWhiteSpace(phoneNumber))
        {
            string normalizedPhone;
            try
            {
                normalizedPhone = customer.AuthMethod == CustomerAuthMethod.PhoneOtp
                    || string.Equals(customer.Country, "India", StringComparison.OrdinalIgnoreCase)
                    ? CustomerAccountService.NormalizePhone(phoneNumber)
                    : CustomerAccountService.NormalizeInternationalPhone(phoneNumber);
            }
            catch (ArgumentException)
            {
                throw new ViviException(
                    "INVALID_PHONE",
                    customer.AuthMethod == CustomerAuthMethod.PhoneOtp
                        || string.Equals(customer.Country, "India", StringComparison.OrdinalIgnoreCase)
                        ? "Phone must be a 10-digit Indian mobile number."
                        : "Enter a valid international phone number with country code.");
            }

            if (customer.AuthMethod == CustomerAuthMethod.PhoneOtp)
            {
                // Login identity for OTP accounts is tied to phone — only allow if free.
                if (!string.Equals(customer.PhoneNumber, normalizedPhone, StringComparison.Ordinal))
                {
                    var phoneTaken = await _db.Customers.AnyAsync(
                        c => c.Id != customer.Id && c.PhoneNumber == normalizedPhone,
                        cancellationToken);
                    if (phoneTaken)
                    {
                        throw ViviException.Conflict(
                            "PHONE_IN_USE",
                            "That phone number is already registered on another account.");
                    }

                    var nextLoginEmail = CustomerAccountService.EmailForPhone(normalizedPhone);
                    var loginTaken = await _db.AdminUsers.AnyAsync(
                        u => u.Id != user.Id && u.Email == nextLoginEmail,
                        cancellationToken);
                    if (loginTaken)
                    {
                        throw ViviException.Conflict(
                            "PHONE_IN_USE",
                            "That phone number is already registered on another account.");
                    }

                    customer.PhoneNumber = normalizedPhone;
                    user.Email = nextLoginEmail;
                    changed = true;
                }
            }
            else
            {
                // Contact phone for email/password accounts (nullable, unique when set).
                var phoneTaken = await _db.Customers.AnyAsync(
                    c => c.Id != customer.Id
                        && c.PhoneNumber != null
                        && c.PhoneNumber == normalizedPhone,
                    cancellationToken);
                if (phoneTaken)
                {
                    throw ViviException.Conflict(
                        "PHONE_IN_USE",
                        "That phone number is already registered on another account.");
                }

                customer.PhoneNumber = normalizedPhone;
                changed = true;
            }
        }

        if (shippingAddress is not null)
        {
            ApplyShippingAddress(customer, shippingAddress, shippingCountry);
            customer.ShipAddressTag = addressTag;
            changed = true;
        }

        if (changed)
        {
            var now = DateTime.UtcNow;
            customer.UpdatedAt = now;
            user.UpdatedAt = now;
            await SyncUserDisplayNameAsync(customer, cancellationToken);
            await _db.SaveChangesAsync(cancellationToken);
        }

        return customer;
    }

    /// <summary>Applies a verified communication email after OTP confirmation.</summary>
    public async Task<Customer> ApplyVerifiedEmailAsync(
        Guid userId,
        string email,
        CancellationToken cancellationToken)
    {
        var customer = await ResolveForUserAsync(userId, cancellationToken);
        var user = await _db.AdminUsers.SingleOrDefaultAsync(u => u.Id == userId, cancellationToken)
            ?? throw ViviException.Unauthorized(
                "SESSION_INVALID",
                "Please sign in again with your phone number to continue.");

        var normalized = CustomerAccountService.NormalizeEmail(email);
        if (!normalized.Contains('@') || normalized.Length < 5)
            throw new ViviException("INVALID_EMAIL", "Enter a valid email address.");

        if (normalized.EndsWith("@vivicrochet.dev", StringComparison.OrdinalIgnoreCase))
            throw new ViviException("INVALID_EMAIL", "Enter a real email address for order updates.");

        await _cleanup.FreeEmailForReuseAsync(normalized, cancellationToken, keepUserId: user.Id);

        var emailTakenByCustomer = await _db.Customers.AnyAsync(
            c => c.Id != customer.Id && c.Email == normalized,
            cancellationToken);
        var emailTakenByUser = await _db.AdminUsers.AnyAsync(
            u => u.Id != user.Id && u.Email == normalized,
            cancellationToken);
        if (emailTakenByCustomer || emailTakenByUser)
        {
            throw ViviException.Conflict(
                "EMAIL_IN_USE",
                "That email is already registered. Sign in with it, or use a different email.");
        }

        var now = DateTime.UtcNow;
        customer.Email = normalized;
        customer.EmailVerifiedAt = now;
        customer.UpdatedAt = now;
        if (customer.AuthMethod == CustomerAuthMethod.EmailPassword)
            user.Email = normalized;
        user.UpdatedAt = now;

        await SyncUserDisplayNameAsync(customer, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
        return customer;
    }

    public async Task SaveShippingAddressAsync(
        Guid customerId,
        ShippingAddressInput shipping,
        CancellationToken cancellationToken)
    {
        var customer = await _db.Customers.SingleOrDefaultAsync(c => c.Id == customerId, cancellationToken);
        if (customer is null)
            return;

        ApplyShippingAddress(customer, shipping);
        customer.UpdatedAt = DateTime.UtcNow;
        await SyncUserDisplayNameAsync(customer, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
    }

    public static void ApplyShippingAddress(
        Customer customer,
        ShippingAddressInput shipping,
        string? country = null)
    {
        var shipName = shipping.FullName.Trim();
        customer.ShipFullName = shipName;
        // Keep account name in sync when it was never collected (OTP placeholder).
        if (CustomerAccountService.IsPlaceholderName(customer.FullName) && !CustomerAccountService.IsPlaceholderName(shipName))
            customer.FullName = shipName;
        customer.ShipPhone = string.IsNullOrWhiteSpace(shipping.PhoneNumber)
            ? null
            : shipping.PhoneNumber.Trim();
        customer.ShipAddressLine1 = shipping.AddressLine1.Trim();
        customer.ShipAddressLine2 = string.IsNullOrWhiteSpace(shipping.AddressLine2)
            ? null
            : shipping.AddressLine2.Trim();
        customer.ShipLandmark = string.IsNullOrWhiteSpace(shipping.Landmark)
            ? null
            : shipping.Landmark.Trim();
        customer.ShipCity = shipping.City.Trim();
        customer.ShipState = shipping.State.Trim();
        customer.ShipPinCode = shipping.PinCode.Trim();
        customer.ShipCountry = string.IsNullOrWhiteSpace(country) ? "India" : country.Trim();
    }

    private async Task SyncUserDisplayNameAsync(Customer customer, CancellationToken cancellationToken)
    {
        if (CustomerAccountService.IsPlaceholderName(customer.FullName))
            return;

        var user = await _db.AdminUsers.SingleOrDefaultAsync(u => u.Id == customer.UserId, cancellationToken);
        if (user is null)
            return;

        if (!string.Equals(user.Name, customer.FullName, StringComparison.Ordinal))
        {
            user.Name = customer.FullName;
            user.UpdatedAt = DateTime.UtcNow;
        }
    }

    private static string? ExtractPhoneFromEmail(string email)
    {
        const string prefix = "customer.";
        const string suffix = "@vivicrochet.dev";
        if (email.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)
            && email.EndsWith(suffix, StringComparison.OrdinalIgnoreCase))
        {
            return email[prefix.Length..^suffix.Length];
        }

        return null;
    }
}
