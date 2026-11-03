using VIVI.Api.DTOs.Live;
using VIVI.Core.Entities;
using VIVI.Infrastructure.Commerce;

namespace VIVI.Api.Mapping;

public static class LiveCourseMapper
{
    public static LiveCourseResponse ToResponse(LiveCourse course) => new()
    {
        Id = course.Id,
        Code = course.Code,
        Name = course.Name,
        Level = course.Level,
        Tagline = course.Tagline,
        Price = course.Price,
        DurationDays = course.DurationDays,
        HoursPerDay = course.HoursPerDay,
        WeeksSpan = course.WeeksSpan,
        IsBundle = course.IsBundle,
        IsActive = course.IsActive,
        SortOrder = course.SortOrder,
        Learn = LiveCourseService.ParseLearn(course.LearnJson),
        Projects = LiveCourseService.ParseProjects(course.ProjectsJson)
            .Select(p => new LiveCourseProjectDto { Name = p.Name, ImageUrl = p.ImageUrl })
            .ToList()
    };

    public static LiveCourseUpdate ToUpdate(UpdateLiveCourseRequest request) => new(
        request.Name,
        request.Level,
        request.Tagline,
        request.Price,
        request.DurationDays,
        request.HoursPerDay,
        request.WeeksSpan,
        request.IsActive,
        request.Learn ?? new List<string>(),
        (request.Projects ?? new List<LiveCourseProjectDto>())
            .Select(p => new LiveCourseProject(p.Name, p.ImageUrl))
            .ToList());
}
