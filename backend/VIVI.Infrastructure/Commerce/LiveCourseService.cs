using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using VIVI.Core.Entities;
using VIVI.Core.Exceptions;
using VIVI.Infrastructure.Data;

namespace VIVI.Infrastructure.Commerce;

public sealed record LiveCourseProject(string Name, string? ImageUrl);

public sealed record LiveCourseUpdate(
    string Name,
    string Level,
    string Tagline,
    decimal Price,
    decimal? Mrp,
    int DurationDays,
    int HoursPerDay,
    int WeeksSpan,
    bool IsActive,
    IReadOnlyList<string> Learn,
    IReadOnlyList<LiveCourseProject> Projects);

/// <summary>Admin-editable Live courses: Basic, Intermediate, Advanced and the Artist pack that bundles them.</summary>
public sealed class LiveCourseService
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly ViviDbContext _db;

    public LiveCourseService(ViviDbContext db) => _db = db;

    /// <summary>Starting content, written once when the table is empty. The admin edits it from then on.</summary>
    private static readonly (string Code, string Name, string Level, string Tagline, decimal Price, decimal? Mrp, int Days, int Hours, int Weeks, bool Bundle, string[] Learn, string[] Projects)[] Defaults =
    {
        ("basic", "Basic", "Beginner friendly", "Learn. Create. Love.", 999m, null, 5, 2, 1, false,
            new[] { "Introduction to crochet", "Basic stitches", "Different types of stitches", "Easy projects", "Step by step learning" },
            new[] { "Flower", "Keychain", "Hairclip", "Hair band", "Coin pouch (no zip)" }),
        ("intermediate", "Intermediate", "Intermediate", "Daily 1 hour", 1499m, null, 10, 1, 2, false,
            new[] { "Step-by-step guidance", "Learn 5 beautiful projects", "Improve your skills", "Create with confidence", "Supportive crochet community" },
            new[] { "Headband", "Mobile pouch", "Flowers making", "Kids cap", "Bow making" }),
        ("advanced", "Advanced", "Advanced", "Daily 1 hour", 2499m, null, 10, 1, 2, false,
            new[]
            {
                "Advanced stitches and techniques", "Project assembly and finishing", "Professional neat finishing",
                "Size adjustment methods", "Colour combination", "Creative detailing", "Create 5 beautiful projects"
            },
            new[] { "Slim zip pouch", "Crochet crop top", "Kids baby sweater set", "Crochet lunch bag", "Amigurumi doll" }),
        ("artist-pack", "Artist pack", "All levels", "3 courses, 1 complete journey", 4499m, 4999m, 25, 1, 5, true,
            new[] { "Basic, Intermediate and Advanced courses", "15+ projects from start to finish", "One complete journey from beginner to artist" },
            Array.Empty<string>())
    };

    public async Task EnsureDefaultsAsync(CancellationToken cancellationToken)
    {
        if (await _db.LiveCourses.AnyAsync(cancellationToken))
            return;

        var now = DateTime.UtcNow;
        var order = 0;
        foreach (var d in Defaults)
        {
            _db.LiveCourses.Add(new LiveCourse
            {
                Id = Guid.NewGuid(),
                Code = d.Code,
                Name = d.Name,
                Level = d.Level,
                Tagline = d.Tagline,
                Price = d.Price,
                Mrp = d.Mrp,
                DurationDays = d.Days,
                HoursPerDay = d.Hours,
                WeeksSpan = d.Weeks,
                IsBundle = d.Bundle,
                IsActive = true,
                SortOrder = ++order,
                LearnJson = JsonSerializer.Serialize(d.Learn, Json),
                ProjectsJson = JsonSerializer.Serialize(d.Projects.Select(p => new LiveCourseProject(p, null)), Json),
                UpdatedAt = now
            });
        }

        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // Another request seeded first (unique Code); drop ours and use theirs.
            foreach (var entry in _db.ChangeTracker.Entries<LiveCourse>().Where(e => e.State == EntityState.Added).ToList())
                entry.State = EntityState.Detached;
        }
    }

    public async Task<List<LiveCourse>> ListAsync(bool activeOnly, CancellationToken cancellationToken)
    {
        await EnsureDefaultsAsync(cancellationToken);
        var query = _db.LiveCourses.AsNoTracking();
        if (activeOnly)
            query = query.Where(c => c.IsActive);
        return await query.OrderBy(c => c.SortOrder).ThenBy(c => c.Name).ToListAsync(cancellationToken);
    }

    public async Task<LiveCourse> UpdateAsync(Guid id, LiveCourseUpdate update, CancellationToken cancellationToken)
    {
        var name = RequireText(update.Name, 80, "Course name");
        var level = RequireText(update.Level, 40, "Level");
        var tagline = (update.Tagline ?? string.Empty).Trim();
        if (tagline.Length > 120)
            throw new ViviException("INVALID_COURSE", "Tagline must be 120 characters or fewer.");
        if (update.Price < 1m || update.Price > 100000m)
            throw new ViviException("INVALID_PRICE", "Price must be between ₹1 and ₹1,00,000.");
        if (update.Mrp is { } mrp && (mrp > 100000m || mrp <= update.Price))
            throw new ViviException("INVALID_PRICE", "Original price must be higher than the price, or left empty.");
        if (update.DurationDays is < 1 or > 60)
            throw new ViviException("INVALID_COURSE", "Duration must be between 1 and 60 days.");
        if (update.HoursPerDay is < 1 or > 8)
            throw new ViviException("INVALID_HOURS", "Hours per day must be between 1 and 8.");
        if (update.WeeksSpan is < 1 or > 8)
            throw new ViviException("INVALID_COURSE", "A course can hold seats for 1 to 8 weeks in a row.");

        var learn = (update.Learn ?? Array.Empty<string>())
            .Select(l => (l ?? string.Empty).Trim())
            .Where(l => l.Length > 0)
            .ToList();
        if (learn.Count > 12 || learn.Any(l => l.Length > 120))
            throw new ViviException("INVALID_COURSE", "Add up to 12 learning points of 120 characters or fewer.");

        var projects = (update.Projects ?? Array.Empty<LiveCourseProject>())
            .Select(p => new LiveCourseProject((p.Name ?? string.Empty).Trim(), string.IsNullOrWhiteSpace(p.ImageUrl) ? null : p.ImageUrl.Trim()))
            .Where(p => p.Name.Length > 0)
            .ToList();
        if (projects.Count > 20 || projects.Any(p => p.Name.Length > 60))
            throw new ViviException("INVALID_COURSE", "Add up to 20 projects with names of 60 characters or fewer.");
        if (projects.Any(p => p.ImageUrl is { } url
                && (url.Length > 500 || !(url.StartsWith("https://", StringComparison.OrdinalIgnoreCase)
                    || url.StartsWith("http://", StringComparison.OrdinalIgnoreCase)))))
            throw new ViviException("INVALID_COURSE", "Project pictures must be web links starting with https://.");

        var course = await _db.LiveCourses.SingleOrDefaultAsync(c => c.Id == id, cancellationToken)
            ?? throw ViviException.NotFound("LIVE_COURSE_NOT_FOUND", "Live course was not found.");

        course.Name = name;
        course.Level = level;
        course.Tagline = tagline;
        course.Price = update.Price;
        course.Mrp = update.Mrp;
        course.DurationDays = update.DurationDays;
        course.HoursPerDay = update.HoursPerDay;
        course.WeeksSpan = update.WeeksSpan;
        course.IsActive = update.IsActive;
        course.LearnJson = JsonSerializer.Serialize(learn, Json);
        course.ProjectsJson = JsonSerializer.Serialize(projects, Json);
        course.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        return course;
    }

    public static IReadOnlyList<string> ParseLearn(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<List<string>>(json, Json) ?? new List<string>();
        }
        catch (JsonException)
        {
            return Array.Empty<string>();
        }
    }

    public static IReadOnlyList<LiveCourseProject> ParseProjects(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<List<LiveCourseProject>>(json, Json) ?? new List<LiveCourseProject>();
        }
        catch (JsonException)
        {
            return Array.Empty<LiveCourseProject>();
        }
    }

    private static string RequireText(string? value, int maxLength, string label)
    {
        var trimmed = (value ?? string.Empty).Trim();
        if (trimmed.Length == 0)
            throw new ViviException("INVALID_COURSE", $"{label} is required.");
        if (trimmed.Length > maxLength)
            throw new ViviException("INVALID_COURSE", $"{label} must be {maxLength} characters or fewer.");
        return trimmed;
    }
}
