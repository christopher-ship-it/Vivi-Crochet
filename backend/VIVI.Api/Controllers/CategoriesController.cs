using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VIVI.Api.DTOs.Categories;
using VIVI.Api.Extensions;
using VIVI.Api.Mapping;
using VIVI.Core.Entities;
using VIVI.Core.Exceptions;
using VIVI.Infrastructure.Data;

namespace VIVI.Api.Controllers;

[ApiController]
[Route("api/categories")]
public sealed class CategoriesController : ControllerBase
{
    private readonly ViviDbContext _db;

    public CategoriesController(ViviDbContext db) => _db = db;

    /// <summary>Lists categories. Anonymous callers only see active categories.</summary>
    [HttpGet]
    [AllowAnonymous]
    [ProducesResponseType(typeof(IReadOnlyList<CategoryResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<CategoryResponse>>> List(CancellationToken cancellationToken)
    {
        var admin = User.IsAdmin();
        var items = await _db.Categories
            .AsNoTracking()
            .Where(c => admin || c.IsActive)
            .OrderBy(c => c.SortOrder)
            .ThenBy(c => c.Name)
            .ToListAsync(cancellationToken);

        return Ok(items.Select(c => c.ToDto()).ToList());
    }

    /// <summary>Creates a category. Admin only.</summary>
    [HttpPost]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(CategoryResponse), StatusCodes.Status201Created)]
    public async Task<ActionResult<CategoryResponse>> Create([FromBody] CategoryRequest request, CancellationToken cancellationToken)
    {
        await EnsureUniqueName(request.Name, null, cancellationToken);
        var now = DateTime.UtcNow;
        var category = new Category
        {
            Id = Guid.NewGuid(),
            Name = request.Name.Trim(),
            Description = request.Description?.Trim(),
            SortOrder = request.SortOrder,
            IsActive = request.IsActive,
            CreatedAt = now,
            UpdatedAt = now
        };
        _db.Categories.Add(category);
        await _db.SaveChangesAsync(cancellationToken);
        return CreatedAtAction(nameof(List), new { id = category.Id }, category.ToDto());
    }

    /// <summary>Updates a category. Admin only.</summary>
    [HttpPut("{id:guid}")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(CategoryResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<CategoryResponse>> Update(Guid id, [FromBody] CategoryRequest request, CancellationToken cancellationToken)
    {
        var category = await _db.Categories.SingleOrDefaultAsync(c => c.Id == id, cancellationToken)
                       ?? throw ViviException.NotFound("CATEGORY_NOT_FOUND", "Category was not found.");

        await EnsureUniqueName(request.Name, id, cancellationToken);
        category.Name = request.Name.Trim();
        category.Description = request.Description?.Trim();
        category.SortOrder = request.SortOrder;
        category.IsActive = request.IsActive;
        category.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        return Ok(category.ToDto());
    }

    /// <summary>Deletes a category. Blocked if any course still uses it.</summary>
    [HttpDelete("{id:guid}")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        var category = await _db.Categories.SingleOrDefaultAsync(c => c.Id == id, cancellationToken)
                       ?? throw ViviException.NotFound("CATEGORY_NOT_FOUND", "Category was not found.");

        var inUse = await _db.Courses.AnyAsync(c => c.CategoryId == id, cancellationToken);
        if (inUse)
            throw ViviException.Conflict("CATEGORY_IN_USE", "Reassign or delete courses in this category first.");

        _db.Categories.Remove(category);
        await _db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    private async Task EnsureUniqueName(string name, Guid? exceptId, CancellationToken cancellationToken)
    {
        var trimmed = name.Trim();
        var exists = await _db.Categories.AnyAsync(
            c => c.Name == trimmed && (!exceptId.HasValue || c.Id != exceptId),
            cancellationToken);
        if (exists)
            throw ViviException.Conflict("CATEGORY_NAME_IN_USE", "A category with that name already exists.");
    }
}
