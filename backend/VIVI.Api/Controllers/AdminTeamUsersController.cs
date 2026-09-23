using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VIVI.Api.Auth;
using VIVI.Api.DTOs.AdminUsers;
using VIVI.Api.Extensions;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Infrastructure.Data;

namespace VIVI.Api.Controllers;

[ApiController]
[Route("api/admin/team-users")]
[Authorize(Roles = AuthRoles.FullAdmin)]
public sealed class AdminTeamUsersController : ControllerBase
{
    private readonly ViviDbContext _db;
    private readonly IPasswordHasher<AdminUser> _passwordHasher;

    public AdminTeamUsersController(ViviDbContext db, IPasswordHasher<AdminUser> passwordHasher)
    {
        _db = db;
        _passwordHasher = passwordHasher;
    }

    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<AdminTeamUserResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<AdminTeamUserResponse>>> List(CancellationToken cancellationToken)
    {
        var users = await _db.AdminUsers
            .AsNoTracking()
            .Where(u => u.Role == UserRole.Admin || u.Role == UserRole.Staff)
            .OrderBy(u => u.Name)
            .ThenBy(u => u.Email)
            .ToListAsync(cancellationToken);

        return Ok(users.Select(Map).ToList());
    }

    [HttpPost]
    [ProducesResponseType(typeof(AdminTeamUserResponse), StatusCodes.Status201Created)]
    public async Task<ActionResult<AdminTeamUserResponse>> Create(
        [FromBody] CreateAdminTeamUserRequest request,
        CancellationToken cancellationToken)
    {
        var email = NormalizeEmail(request.Email);
        var name = request.Name.Trim();
        var role = ParseConsoleRole(request.Role);

        if (name.Length < 2)
            throw new ViviException("INVALID_NAME", "Enter a name with at least 2 characters.");

        var exists = await _db.AdminUsers.AnyAsync(u => u.Email == email, cancellationToken);
        if (exists)
            throw ViviException.Conflict("EMAIL_IN_USE", "That email is already registered.");

        var now = DateTime.UtcNow;
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = email,
            Name = name,
            Role = role,
            IsActive = true,
            CreatedAt = now,
            UpdatedAt = now,
        };
        user.PasswordHash = _passwordHasher.HashPassword(user, request.Password);

        _db.AdminUsers.Add(user);
        await _db.SaveChangesAsync(cancellationToken);

        return CreatedAtAction(nameof(List), Map(user));
    }

    [HttpPut("{id:guid}")]
    [ProducesResponseType(typeof(AdminTeamUserResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminTeamUserResponse>> Update(
        Guid id,
        [FromBody] UpdateAdminTeamUserRequest request,
        CancellationToken cancellationToken)
    {
        var user = await _db.AdminUsers.SingleOrDefaultAsync(
            u => u.Id == id && (u.Role == UserRole.Admin || u.Role == UserRole.Staff),
            cancellationToken)
            ?? throw ViviException.NotFound("USER_NOT_FOUND", "Team user was not found.");

        var name = request.Name.Trim();
        if (name.Length < 2)
            throw new ViviException("INVALID_NAME", "Enter a name with at least 2 characters.");

        var role = ParseConsoleRole(request.Role);
        var actorId = User.GetUserId();

        if (user.Id == actorId && !request.IsActive)
            throw ViviException.Conflict("CANNOT_DEACTIVATE_SELF", "You cannot deactivate your own account.");

        if (user.Id == actorId && role != UserRole.Admin)
            throw ViviException.Conflict("CANNOT_DEMOTE_SELF", "You cannot remove your own admin access.");

        if (user.Role == UserRole.Admin && (role != UserRole.Admin || !request.IsActive))
        {
            var otherAdmins = await _db.AdminUsers.CountAsync(
                u => u.Id != user.Id && u.Role == UserRole.Admin && u.IsActive,
                cancellationToken);
            if (otherAdmins == 0)
                throw ViviException.Conflict(
                    "LAST_ADMIN",
                    "Keep at least one active admin account.");
        }

        user.Name = name;
        user.Role = role;
        user.IsActive = request.IsActive;
        user.UpdatedAt = DateTime.UtcNow;

        if (!string.IsNullOrWhiteSpace(request.NewPassword))
            user.PasswordHash = _passwordHasher.HashPassword(user, request.NewPassword.Trim());

        await _db.SaveChangesAsync(cancellationToken);
        return Ok(Map(user));
    }

    private static string NormalizeEmail(string email)
        => email.Trim().ToLowerInvariant();

    private static UserRole ParseConsoleRole(string role)
    {
        if (string.Equals(role?.Trim(), nameof(UserRole.Admin), StringComparison.OrdinalIgnoreCase))
            return UserRole.Admin;
        if (string.Equals(role?.Trim(), nameof(UserRole.Staff), StringComparison.OrdinalIgnoreCase))
            return UserRole.Staff;
        throw new ViviException("INVALID_ROLE", "Role must be Admin or Staff.");
    }

    private static AdminTeamUserResponse Map(AdminUser user) => new()
    {
        Id = user.Id,
        Email = user.Email,
        Name = user.Name,
        Role = user.Role.ToString(),
        IsActive = user.IsActive,
        CreatedAt = user.CreatedAt,
        UpdatedAt = user.UpdatedAt,
    };
}
