using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VIVI.Api.Auth;
using VIVI.Api.DTOs.AdminUsers;
using VIVI.Api.DTOs.Auth;
using VIVI.Api.Extensions;
using VIVI.Api.Mapping;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Infrastructure.Data;

namespace VIVI.Api.Controllers;

[ApiController]
[Route("api/admin/me")]
[Authorize(Roles = AuthRoles.Console)]
public sealed class AdminMeController : ControllerBase
{
    private readonly ViviDbContext _db;

    public AdminMeController(ViviDbContext db) => _db = db;

    [HttpGet]
    [ProducesResponseType(typeof(AdminUserDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminUserDto>> GetProfile(CancellationToken cancellationToken)
    {
        var user = await LoadConsoleUserAsync(cancellationToken);
        return Ok(user.ToDto());
    }

    [HttpPut]
    [ProducesResponseType(typeof(AdminUserDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminUserDto>> UpdateProfile(
        [FromBody] UpdateAdminProfileRequest request,
        CancellationToken cancellationToken)
    {
        var user = await LoadConsoleUserAsync(cancellationToken);
        var name = request.Name.Trim();
        if (name.Length < 2)
            throw new ViviException("INVALID_NAME", "Enter a name with at least 2 characters.");

        user.Name = name;
        user.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        return Ok(user.ToDto());
    }

    private async Task<AdminUser> LoadConsoleUserAsync(CancellationToken cancellationToken)
    {
        var id = User.GetUserId();
        var user = await _db.AdminUsers.SingleOrDefaultAsync(u => u.Id == id, cancellationToken)
            ?? throw ViviException.Unauthorized("UNAUTHORIZED", "Your session is no longer valid.");

        if (!user.IsActive || user.Role is not (UserRole.Admin or UserRole.Staff))
            throw ViviException.Unauthorized("UNAUTHORIZED", "Your session is no longer valid.");

        return user;
    }
}
