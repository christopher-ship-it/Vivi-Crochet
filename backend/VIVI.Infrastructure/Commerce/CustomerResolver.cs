using Microsoft.EntityFrameworkCore;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Data;

namespace VIVI.Infrastructure.Commerce;

public sealed class CustomerResolver
{
    private readonly ViviDbContext _db;

    public CustomerResolver(ViviDbContext db) => _db = db;

    public async Task<Customer> ResolveForUserAsync(Guid userId, CancellationToken cancellationToken)
    {
        var user = await _db.AdminUsers
            .AsNoTracking()
            .SingleOrDefaultAsync(u => u.Id == userId, cancellationToken);

        if (user is null || user.Role != UserRole.Customer || !user.IsActive)
            throw ViviException.Forbidden("CUSTOMER_ONLY", "This action requires a customer account.");

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
        ShippingAddressInput? shippingAddress,
        CancellationToken cancellationToken)
    {
        var customer = await ResolveForUserAsync(userId, cancellationToken);
        var changed = false;
        if (!string.IsNullOrWhiteSpace(fullName))
        {
            customer.FullName = fullName.Trim();
            changed = true;
        }

        if (!string.IsNullOrWhiteSpace(email))
        {
            var normalized = email.Trim().ToLowerInvariant();
            if (!normalized.Contains('@') || normalized.Length < 5)
                throw ViviException.Conflict("INVALID_EMAIL", "Enter a valid email address for order confirmations.");

            customer.Email = normalized;
            changed = true;
        }

        if (shippingAddress is not null)
        {
            ApplyShippingAddress(customer, shippingAddress);
            changed = true;
        }

        if (changed)
        {
            customer.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(cancellationToken);
        }

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
        await _db.SaveChangesAsync(cancellationToken);
    }

    public static void ApplyShippingAddress(Customer customer, ShippingAddressInput shipping)
    {
        customer.ShipFullName = shipping.FullName.Trim();
        customer.ShipPhone = shipping.PhoneNumber.Trim();
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
        customer.ShipCountry = "India";
    }

    private static string ExtractPhoneFromEmail(string email)
    {
        const string prefix = "customer.";
        const string suffix = "@vivicrochet.dev";
        if (email.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)
            && email.EndsWith(suffix, StringComparison.OrdinalIgnoreCase))
        {
            return email[prefix.Length..^suffix.Length];
        }

        return "0000000000";
    }
}
