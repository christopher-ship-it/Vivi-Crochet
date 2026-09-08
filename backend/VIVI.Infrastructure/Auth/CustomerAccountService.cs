using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Infrastructure.Data;

namespace VIVI.Infrastructure.Auth;

public sealed class CustomerAccountService
{
    private readonly ViviDbContext _db;
    private readonly IPasswordHasher<AdminUser> _passwordHasher;

    public CustomerAccountService(ViviDbContext db, IPasswordHasher<AdminUser> passwordHasher)
    {
        _db = db;
        _passwordHasher = passwordHasher;
    }

    public static string NormalizePhone(string phone)
    {
        var digits = new string(phone.Where(char.IsDigit).ToArray());
        if (digits.Length == 12 && digits.StartsWith("91", StringComparison.Ordinal))
            digits = digits[2..];
        if (digits.Length != 10)
            throw new ArgumentException("Phone must be a 10-digit Indian mobile number.", nameof(phone));
        return digits;
    }

    public static string EmailForPhone(string phone) => $"customer.{phone}@vivicrochet.dev".ToLowerInvariant();

    public async Task<AdminUser> GetOrCreateAsync(string phone, string? name, CancellationToken cancellationToken)
    {
        var normalized = NormalizePhone(phone);
        var email = EmailForPhone(normalized);
        var user = await _db.AdminUsers.SingleOrDefaultAsync(u => u.Email == email, cancellationToken);
        var now = DateTime.UtcNow;

        if (user is null)
        {
            user = new AdminUser
            {
                Id = Guid.NewGuid(),
                Email = email,
                Name = string.IsNullOrWhiteSpace(name) ? "VIVI Customer" : name.Trim(),
                Role = UserRole.Customer,
                IsActive = true,
                CreatedAt = now,
                UpdatedAt = now,
                PasswordHash = _passwordHasher.HashPassword(new AdminUser(), Guid.NewGuid().ToString("N"))
            };
            _db.AdminUsers.Add(user);

            _db.Customers.Add(new Customer
            {
                Id = Guid.NewGuid(),
                UserId = user.Id,
                FullName = user.Name,
                PhoneNumber = normalized,
                Email = email,
                IsActive = true,
                CreatedAt = now,
                UpdatedAt = now
            });
        }
        else
        {
            if (!user.IsActive)
                throw ViviException.Unauthorized("INVALID_CREDENTIALS", "This account is inactive.");

            if (!string.IsNullOrWhiteSpace(name))
                user.Name = name.Trim();

            user.UpdatedAt = now;

            var customer = await _db.Customers.SingleOrDefaultAsync(c => c.UserId == user.Id, cancellationToken);
            if (customer is null)
            {
                _db.Customers.Add(new Customer
                {
                    Id = Guid.NewGuid(),
                    UserId = user.Id,
                    FullName = user.Name,
                    PhoneNumber = normalized,
                    Email = email,
                    IsActive = true,
                    CreatedAt = now,
                    UpdatedAt = now
                });
            }
            else if (!string.IsNullOrWhiteSpace(name))
            {
                customer.FullName = name.Trim();
                customer.UpdatedAt = now;
            }
        }

        await _db.SaveChangesAsync(cancellationToken);
        return user;
    }
}
