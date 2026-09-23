using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Infrastructure.Commerce;
using VIVI.Infrastructure.Data;

namespace VIVI.Infrastructure.Auth;

public sealed class CustomerAccountService
{
    /// <summary>Stored when OTP verify did not include a name. Treat as unset in UI/admin.</summary>
    public const string PlaceholderName = "VIVI Customer";

    private readonly ViviDbContext _db;
    private readonly IPasswordHasher<AdminUser> _passwordHasher;
    private readonly AdminDataCleanupService _cleanup;

    public CustomerAccountService(
        ViviDbContext db,
        IPasswordHasher<AdminUser> passwordHasher,
        AdminDataCleanupService cleanup)
    {
        _db = db;
        _passwordHasher = passwordHasher;
        _cleanup = cleanup;
    }

    public static bool IsPlaceholderName(string? name) =>
        string.IsNullOrWhiteSpace(name)
        || string.Equals(name.Trim(), PlaceholderName, StringComparison.OrdinalIgnoreCase);

    public static string NormalizePhone(string phone)
    {
        var digits = new string(phone.Where(char.IsDigit).ToArray());
        if (digits.Length == 12 && digits.StartsWith("91", StringComparison.Ordinal))
            digits = digits[2..];
        if (digits.Length != 10)
            throw new ArgumentException("Phone must be a 10-digit Indian mobile number.", nameof(phone));
        return digits;
    }

    /// <summary>Digits-only E.164 contact number for international email accounts (8–15 digits).</summary>
    public static string NormalizeInternationalPhone(string phone)
    {
        var digits = new string(phone.Where(char.IsDigit).ToArray());
        if (digits.Length is < 8 or > 15)
            throw new ArgumentException("Phone must be a valid international number.", nameof(phone));
        return digits;
    }

    public static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();

    public static string EmailForPhone(string phone) => $"customer.{phone}@vivicrochet.dev".ToLowerInvariant();

    public async Task<AdminUser> GetOrCreateAsync(
        string phone,
        string? name,
        CancellationToken cancellationToken,
        int? age = null,
        string? state = null,
        string? city = null)
    {
        var normalized = NormalizePhone(phone);
        var email = EmailForPhone(normalized);
        var user = await _db.AdminUsers.SingleOrDefaultAsync(u => u.Email == email, cancellationToken);
        var now = DateTime.UtcNow;
        var hasRealName = !IsPlaceholderName(name);
        var resolvedName = hasRealName ? name!.Trim() : PlaceholderName;

        if (user is null)
        {
            user = new AdminUser
            {
                Id = Guid.NewGuid(),
                Email = email,
                Name = resolvedName,
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
                Age = age,
                Country = "India",
                State = TrimOrNull(state),
                City = TrimOrNull(city),
                AuthMethod = CustomerAuthMethod.PhoneOtp,
                IsActive = true,
                CreatedAt = now,
                UpdatedAt = now
            });
        }
        else
        {
            if (!user.IsActive)
                throw ViviException.Unauthorized("INVALID_CREDENTIALS", "This account is inactive.");

            if (hasRealName)
                user.Name = resolvedName;

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
                    Age = age,
                    Country = "India",
                    State = TrimOrNull(state),
                    City = TrimOrNull(city),
                    AuthMethod = CustomerAuthMethod.PhoneOtp,
                    IsActive = true,
                    CreatedAt = now,
                    UpdatedAt = now
                });
            }
            else
            {
                if (hasRealName)
                    customer.FullName = resolvedName;
                customer.PhoneNumber = normalized;
                customer.AuthMethod = CustomerAuthMethod.PhoneOtp;
                if (string.IsNullOrWhiteSpace(customer.Country))
                    customer.Country = "India";
                if (age is > 0)
                    customer.Age = age;
                if (!string.IsNullOrWhiteSpace(state))
                    customer.State = state.Trim();
                if (!string.IsNullOrWhiteSpace(city))
                    customer.City = city.Trim();
                // Every successful sign-in refreshes last-active for admin tracking.
                customer.UpdatedAt = now;
            }
        }

        await _db.SaveChangesAsync(cancellationToken);
        return user;
    }

    public async Task<AdminUser> RegisterWithEmailAsync(
        string email,
        string password,
        int age,
        string country,
        string? name,
        CancellationToken cancellationToken)
    {
        var normalizedEmail = NormalizeEmail(email);
        if (normalizedEmail.EndsWith("@vivicrochet.dev", StringComparison.OrdinalIgnoreCase))
            throw new ViviException("INVALID_EMAIL", "That email address cannot be used.");

        if (age < 1 || age > 120)
            throw new ViviException("INVALID_AGE", "Please enter a valid age.");

        var trimmedCountry = country.Trim();
        if (trimmedCountry.Length < 2)
            throw new ViviException("INVALID_COUNTRY", "Please select your country.");

        // Dashboard customer deletes can leave orphan login rows; free the email first.
        await _cleanup.FreeEmailForReuseAsync(normalizedEmail, cancellationToken);

        var existing = await _db.AdminUsers.SingleOrDefaultAsync(u => u.Email == normalizedEmail, cancellationToken);
        if (existing is not null)
            throw ViviException.Conflict(
                "EMAIL_IN_USE",
                "An account with this email already exists. Sign in instead (or use Forgot password).");

        var now = DateTime.UtcNow;
        var resolvedName = IsPlaceholderName(name) ? PlaceholderName : name!.Trim();
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = normalizedEmail,
            Name = resolvedName,
            Role = UserRole.Customer,
            IsActive = true,
            CreatedAt = now,
            UpdatedAt = now
        };
        user.PasswordHash = _passwordHasher.HashPassword(user, password);
        _db.AdminUsers.Add(user);

        _db.Customers.Add(new Customer
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            FullName = resolvedName,
            PhoneNumber = null,
            Email = normalizedEmail,
            Age = age,
            Country = trimmedCountry,
            AuthMethod = CustomerAuthMethod.EmailPassword,
            IsActive = true,
            CreatedAt = now,
            UpdatedAt = now
        });

        await _db.SaveChangesAsync(cancellationToken);
        return user;
    }

    public async Task<AdminUser> LoginWithEmailAsync(
        string email,
        string password,
        CancellationToken cancellationToken)
    {
        var normalizedEmail = NormalizeEmail(email);
        var user = await _db.AdminUsers.SingleOrDefaultAsync(u => u.Email == normalizedEmail, cancellationToken);

        if (user is null || user.Role != UserRole.Customer)
            throw ViviException.Unauthorized(
                "ACCOUNT_NOT_FOUND",
                "No account found for this email. Please create an account.");

        if (!user.IsActive)
            throw ViviException.Unauthorized("INVALID_CREDENTIALS", "This account is inactive.");

        var customer = await _db.Customers.SingleOrDefaultAsync(c => c.UserId == user.Id, cancellationToken);
        if (customer is null || customer.AuthMethod != CustomerAuthMethod.EmailPassword)
            throw ViviException.Unauthorized(
                "ACCOUNT_NOT_FOUND",
                "No Outside India email account found for this address. Please create an account.");

        if (!customer.IsActive)
            throw ViviException.Unauthorized("INVALID_CREDENTIALS", "This account is inactive.");

        var verification = _passwordHasher.VerifyHashedPassword(user, user.PasswordHash, password);
        if (verification == PasswordVerificationResult.Failed)
            throw ViviException.Unauthorized("INVALID_CREDENTIALS", "Email or password is incorrect.");

        var now = DateTime.UtcNow;
        user.UpdatedAt = now;
        customer.UpdatedAt = now;
        await _db.SaveChangesAsync(cancellationToken);
        return user;
    }

    public async Task ResetPasswordWithEmailAsync(
        string email,
        string newPassword,
        CancellationToken cancellationToken)
    {
        var normalizedEmail = NormalizeEmail(email);
        var user = await _db.AdminUsers.SingleOrDefaultAsync(u => u.Email == normalizedEmail, cancellationToken)
            ?? throw ViviException.Unauthorized("INVALID_CREDENTIALS", "Unable to reset password for this account.");

        if (!user.IsActive || user.Role != UserRole.Customer)
            throw ViviException.Unauthorized("INVALID_CREDENTIALS", "Unable to reset password for this account.");

        var customer = await _db.Customers.SingleOrDefaultAsync(c => c.UserId == user.Id, cancellationToken);
        if (customer is null || !customer.IsActive || customer.AuthMethod != CustomerAuthMethod.EmailPassword)
            throw ViviException.Unauthorized("INVALID_CREDENTIALS", "Unable to reset password for this account.");

        var now = DateTime.UtcNow;
        user.PasswordHash = _passwordHasher.HashPassword(user, newPassword);
        user.UpdatedAt = now;
        customer.UpdatedAt = now;
        await _db.SaveChangesAsync(cancellationToken);
    }

    private static string? TrimOrNull(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
