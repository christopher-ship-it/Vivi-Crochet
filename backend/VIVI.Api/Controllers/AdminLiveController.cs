using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VIVI.Api.Auth;
using VIVI.Api.DTOs.Live;
using VIVI.Api.Mapping;
using VIVI.Api.Services;
using VIVI.Core;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Commerce;
using VIVI.Infrastructure.Data;
using VIVI.Infrastructure.Email.Templates;

namespace VIVI.Api.Controllers;

[ApiController]
[Route("api/admin/live")]
[Authorize(Roles = AuthRoles.Console)]
public sealed class AdminLiveController : ControllerBase
{
    private readonly ViviDbContext _db;
    private readonly LiveCalendarService _calendar;
    private readonly LiveBookingService _bookings;
    private readonly LiveCourseService _courses;
    private readonly IBlobStorageService _blob;
    private readonly AdminDataCleanupService _cleanup;
    private readonly ILogger<AdminLiveController> _logger;
    private readonly IEmailService _email;

    public AdminLiveController(
        ViviDbContext db,
        LiveCalendarService calendar,
        LiveBookingService bookings,
        LiveCourseService courses,
        IBlobStorageService blob,
        AdminDataCleanupService cleanup,
        ILogger<AdminLiveController> logger,
        IEmailService email)
    {
        _db = db;
        _calendar = calendar;
        _bookings = bookings;
        _courses = courses;
        _blob = blob;
        _cleanup = cleanup;
        _logger = logger;
        _email = email;
    }

    /// <summary>Enquiries confirmed outside the app, newest first.</summary>
    [HttpGet("enquiries")]
    [ProducesResponseType(typeof(IReadOnlyList<LiveEnquiryDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<LiveEnquiryDto>>> ListEnquiries(CancellationToken cancellationToken)
    {
        var rows = await _db.LiveEnquiries
            .AsNoTracking()
            .OrderByDescending(e => e.CreatedAt)
            .Take(200)
            .ToListAsync(cancellationToken);
        return Ok(rows.Select(MapEnquiry).ToList());
    }

    /// <summary>
    /// Records an enquiry the student paid for outside the app, then emails the class plan.
    /// If the email cannot be sent the record is kept and can be resent from the list.
    /// </summary>
    [HttpPost("enquiries")]
    [ProducesResponseType(typeof(LiveEnquiryDto), StatusCodes.Status201Created)]
    public async Task<ActionResult<LiveEnquiryDto>> CreateEnquiry(
        [FromBody] CreateLiveEnquiryRequest request,
        CancellationToken cancellationToken)
    {
        var name = (request.Name ?? string.Empty).Trim();
        var email = LiveEnquiryValidation.NormalizeEmail(request.Email);
        var phone = string.IsNullOrWhiteSpace(request.Phone)
            ? null
            : new string(request.Phone.Where(char.IsDigit).ToArray());
        var reference = (request.PaymentReference ?? string.Empty).Trim();
        if (name.Length is 0 or > 120)
            throw new ViviException("INVALID_ENQUIRY", "Student name is required, up to 120 characters.");
        if (!LiveEnquiryValidation.IsValidEmail(email))
            throw new ViviException("INVALID_ENQUIRY", "Enter a valid email address.");
        if (phone is { Length: > 30 })
            throw new ViviException("INVALID_ENQUIRY", "Phone number is too long.");
        var classTime = (request.ClassTime ?? string.Empty).Trim();
        if (classTime.Length is 0 or > 60)
            throw new ViviException("INVALID_ENQUIRY", "Class time is required, up to 60 characters.");
        if (reference.Length is 0 or > 120)
            throw new ViviException("INVALID_ENQUIRY", "Payment reference is required, up to 120 characters.");

        var course = await _db.LiveCourses.AsNoTracking()
            .SingleOrDefaultAsync(c => c.Id == request.CourseId, cancellationToken)
            ?? throw ViviException.NotFound("LIVE_COURSE_NOT_FOUND", "Live course was not found.");
        var week = await _db.LiveWeeks.AsNoTracking()
            .SingleOrDefaultAsync(w => w.Id == request.WeekId, cancellationToken)
            ?? throw ViviException.NotFound("LIVE_WEEK_NOT_FOUND", "Live week was not found.");
        var weeksHeld = Math.Max(1, course.WeeksSpan);

        var enquiry = new LiveEnquiry
        {
            Id = Guid.NewGuid(),
            Name = name,
            Email = email,
            Phone = phone,
            CourseId = course.Id,
            CourseName = course.Name,
            Price = course.Price,
            WeekId = week.Id,
            WeekNumber = week.WeekNumber,
            StartDate = week.StartDate,
            EndDate = week.StartDate.AddDays(7 * weeksHeld - 1),
            WeeksHeld = weeksHeld,
            SlotName = _calendar.SlotName(request.SlotType),
            SlotHours = classTime,
            PaymentReference = reference,
            CreatedAt = DateTime.UtcNow
        };
        _db.LiveEnquiries.Add(enquiry);
        await _db.SaveChangesAsync(cancellationToken);

        await TrySendPlanAsync(enquiry, course, cancellationToken);
        return CreatedAtAction(nameof(ListEnquiries), MapEnquiry(enquiry));
    }

    /// <summary>Sends the class-plan email again, for an enquiry whose first send failed.</summary>
    [HttpPost("enquiries/{id:guid}/send")]
    [ProducesResponseType(typeof(LiveEnquiryDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<LiveEnquiryDto>> SendEnquiry(Guid id, CancellationToken cancellationToken)
    {
        var enquiry = await _db.LiveEnquiries
            .SingleOrDefaultAsync(e => e.Id == id, cancellationToken)
            ?? throw ViviException.NotFound("LIVE_ENQUIRY_NOT_FOUND", "Enquiry was not found.");
        var course = enquiry.CourseId is { } courseId
            ? await _db.LiveCourses.AsNoTracking().SingleOrDefaultAsync(c => c.Id == courseId, cancellationToken)
            : null;

        await TrySendPlanAsync(enquiry, course, cancellationToken);
        return Ok(MapEnquiry(enquiry));
    }

    /// <summary>Emails the class plan and stamps SentAt on success. A failed send is logged, not thrown.</summary>
    private async Task TrySendPlanAsync(LiveEnquiry enquiry, LiveCourse? course, CancellationToken cancellationToken)
    {
        if (!_email.IsConfigured)
            return;

        var learn = course is null ? Array.Empty<string>() : LiveCourseService.ParseLearn(course.LearnJson);
        var projects = course is null
            ? new List<string>()
            : LiveCourseService.ParseProjects(course.ProjectsJson).Select(p => p.Name).ToList();
        var (subject, html, text) = LiveEnquiryEmail.Render(enquiry, learn, projects);
        var result = await _email.SendAsync(
            new EmailSendRequest(enquiry.Email, subject, html, text),
            cancellationToken);

        if (!result.Success)
        {
            _logger.LogWarning("Live class plan email failed for enquiry {EnquiryId}: {Error}", enquiry.Id, result.Error);
            return;
        }

        var tracked = await _db.LiveEnquiries.SingleAsync(e => e.Id == enquiry.Id, cancellationToken);
        tracked.SentAt = DateTime.UtcNow;
        enquiry.SentAt = tracked.SentAt;
        await _db.SaveChangesAsync(cancellationToken);
    }

    private static LiveEnquiryDto MapEnquiry(LiveEnquiry e) => new()
    {
        Id = e.Id,
        Name = e.Name,
        Email = e.Email,
        Phone = e.Phone,
        CourseName = e.CourseName,
        Price = e.Price,
        WeekNumber = e.WeekNumber,
        StartDate = e.StartDate,
        EndDate = e.EndDate,
        SlotName = e.SlotName,
        SlotHours = e.SlotHours,
        PaymentReference = e.PaymentReference,
        SentAt = e.SentAt,
        CreatedAt = e.CreatedAt
    };

    [HttpPost("ensure-season")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> EnsureSeason(CancellationToken cancellationToken)
    {
        await _calendar.EnsureSeasonAsync(cancellationToken);
        return NoContent();
    }

    [HttpGet("weeks")]
    [ProducesResponseType(typeof(IReadOnlyList<AdminLiveWeekResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<AdminLiveWeekResponse>>> ListWeeks(CancellationToken cancellationToken)
    {
        await _calendar.EnsureSeasonAsync(cancellationToken);
        await _bookings.ReleaseExpiredReservationsAsync(cancellationToken);

        var weeks = await _db.LiveWeeks
            .AsNoTracking()
            .Include(w => w.Slots)
            .OrderBy(w => w.SeasonYear)
            .ThenBy(w => w.WeekNumber)
            .ToListAsync(cancellationToken);

        var tutorDefault = await _calendar.GetOrCreateTutorDefaultAsync(cancellationToken);
        return Ok(await Task.WhenAll(weeks.Select(w => MapWeekAsync(w, tutorDefault, cancellationToken))));
    }

    [HttpGet("tutor-default")]
    [ProducesResponseType(typeof(AdminLiveTutorDefaultResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminLiveTutorDefaultResponse>> GetTutorDefault(CancellationToken cancellationToken)
    {
        var tutorDefault = await _calendar.GetOrCreateTutorDefaultAsync(cancellationToken);
        return Ok(await MapTutorDefaultAsync(tutorDefault, cancellationToken));
    }

    [HttpPost("tutor-default/photo-upload-url")]
    [ProducesResponseType(typeof(LiveTutorPhotoUploadUrlResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<LiveTutorPhotoUploadUrlResponse>> CreateTutorDefaultPhotoUploadUrl(
        [FromBody] LiveTutorPhotoUploadUrlRequest request,
        CancellationToken cancellationToken)
    {
        ImageFileRules.Validate(
            request.FileName,
            request.ContentType,
            request.FileSizeBytes,
            ImageFileRules.DefaultMaxBytes);

        var safeName = ImageFileRules.SanitizeFileName(request.FileName);
        var uniqueName = $"{Guid.NewGuid():N}-{safeName}";
        var blobPath = ImageFileRules.BuildLiveTutorDefaultPhotoBlobPath(uniqueName);
        var ticket = await _blob.CreateUploadSasAsync(blobPath, request.ContentType.Trim(), cancellationToken);

        return Ok(new LiveTutorPhotoUploadUrlResponse
        {
            UploadUrl = ticket.UploadUrl,
            ExpiresAt = ticket.ExpiresAt,
            BlobPath = blobPath,
            MaxFileSizeBytes = ImageFileRules.DefaultMaxBytes
        });
    }

    [HttpPost("tutor-default/photo-upload-complete")]
    [ProducesResponseType(typeof(AdminLiveTutorDefaultResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminLiveTutorDefaultResponse>> CompleteTutorDefaultPhotoUpload(
        [FromBody] LiveTutorPhotoUploadCompleteRequest request,
        CancellationToken cancellationToken)
    {
        if (!ImageFileRules.IsOwnedLiveTutorDefaultPhotoPath(request.BlobPath))
            throw new ViviException("INVALID_BLOB_PATH", "The blob path does not belong to the default tutor photo.");

        ImageFileRules.Validate(
            Path.GetFileName(request.BlobPath),
            request.ContentType,
            request.FileSizeBytes,
            ImageFileRules.DefaultMaxBytes);

        var completed = await _blob.TryCompleteUploadAsync(
            request.BlobPath,
            request.FileSizeBytes,
            request.ContentType.Trim(),
            cancellationToken);

        if (!completed)
            throw ViviException.Conflict(
                "BLOB_MISSING",
                "The image file was not found in storage. Upload it to the SAS URL, then retry.");

        var tutorDefault = await _calendar.GetOrCreateTutorDefaultAsync(cancellationToken);
        var previous = tutorDefault.TutorPhotoBlobPath;
        tutorDefault.TutorPhotoBlobPath = request.BlobPath;
        tutorDefault.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        if (!string.IsNullOrWhiteSpace(previous)
            && !string.Equals(previous, request.BlobPath, StringComparison.OrdinalIgnoreCase)
            && ProductImageResolver.IsBlobPath(previous))
        {
            try
            {
                await _blob.DeleteAsync(previous, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to delete previous default tutor photo {BlobPath}", previous);
            }
        }

        return Ok(await MapTutorDefaultAsync(tutorDefault, cancellationToken));
    }

    [HttpDelete("tutor-default/photo")]
    [ProducesResponseType(typeof(AdminLiveTutorDefaultResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminLiveTutorDefaultResponse>> DeleteTutorDefaultPhoto(
        CancellationToken cancellationToken)
    {
        var tutorDefault = await _calendar.GetOrCreateTutorDefaultAsync(cancellationToken);
        var previous = tutorDefault.TutorPhotoBlobPath;
        tutorDefault.TutorPhotoBlobPath = null;
        tutorDefault.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        if (!string.IsNullOrWhiteSpace(previous) && ProductImageResolver.IsBlobPath(previous))
        {
            try
            {
                await _blob.DeleteAsync(previous, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to delete default tutor photo {BlobPath}", previous);
            }
        }

        return Ok(await MapTutorDefaultAsync(tutorDefault, cancellationToken));
    }

    [HttpPut("tutor-default/name")]
    [ProducesResponseType(typeof(AdminLiveTutorDefaultResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminLiveTutorDefaultResponse>> SetTutorDefaultName(
        [FromBody] SetLiveWeekTutorRequest request,
        CancellationToken cancellationToken)
    {
        var name = (request.TutorName ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(name))
            throw new ViviException("INVALID_TUTOR_NAME", "Tutor name is required.");
        if (name.Length > 100)
            throw new ViviException("INVALID_TUTOR_NAME", "Tutor name must be 100 characters or fewer.");

        var tutorDefault = await _calendar.GetOrCreateTutorDefaultAsync(cancellationToken);
        tutorDefault.TutorName = name;
        tutorDefault.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        return Ok(await MapTutorDefaultAsync(tutorDefault, cancellationToken));
    }

    [HttpPost("weeks/{weekId:guid}/tutor-photo-upload-url")]
    [ProducesResponseType(typeof(LiveTutorPhotoUploadUrlResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<LiveTutorPhotoUploadUrlResponse>> CreateTutorPhotoUploadUrl(
        Guid weekId,
        [FromBody] LiveTutorPhotoUploadUrlRequest request,
        CancellationToken cancellationToken)
    {
        _ = await _db.LiveWeeks.AsNoTracking()
                .SingleOrDefaultAsync(w => w.Id == weekId, cancellationToken)
            ?? throw ViviException.NotFound("LIVE_WEEK_NOT_FOUND", "Live week was not found.");

        ImageFileRules.Validate(
            request.FileName,
            request.ContentType,
            request.FileSizeBytes,
            ImageFileRules.DefaultMaxBytes);

        var safeName = ImageFileRules.SanitizeFileName(request.FileName);
        var uniqueName = $"{Guid.NewGuid():N}-{safeName}";
        var blobPath = ImageFileRules.BuildLiveTutorPhotoBlobPath(weekId, uniqueName);
        var ticket = await _blob.CreateUploadSasAsync(blobPath, request.ContentType.Trim(), cancellationToken);

        return Ok(new LiveTutorPhotoUploadUrlResponse
        {
            UploadUrl = ticket.UploadUrl,
            ExpiresAt = ticket.ExpiresAt,
            BlobPath = blobPath,
            MaxFileSizeBytes = ImageFileRules.DefaultMaxBytes
        });
    }

    [HttpPost("weeks/{weekId:guid}/tutor-photo-upload-complete")]
    [ProducesResponseType(typeof(AdminLiveWeekResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminLiveWeekResponse>> CompleteTutorPhotoUpload(
        Guid weekId,
        [FromBody] LiveTutorPhotoUploadCompleteRequest request,
        CancellationToken cancellationToken)
    {
        if (!ImageFileRules.IsOwnedLiveTutorPhotoPath(weekId, request.BlobPath))
            throw new ViviException("INVALID_BLOB_PATH", "The blob path does not belong to this live week.");

        ImageFileRules.Validate(
            Path.GetFileName(request.BlobPath),
            request.ContentType,
            request.FileSizeBytes,
            ImageFileRules.DefaultMaxBytes);

        var completed = await _blob.TryCompleteUploadAsync(
            request.BlobPath,
            request.FileSizeBytes,
            request.ContentType.Trim(),
            cancellationToken);

        if (!completed)
            throw ViviException.Conflict(
                "BLOB_MISSING",
                "The image file was not found in storage. Upload it to the SAS URL, then retry.");

        var week = await _db.LiveWeeks
                .Include(w => w.Slots)
                .SingleOrDefaultAsync(w => w.Id == weekId, cancellationToken)
            ?? throw ViviException.NotFound("LIVE_WEEK_NOT_FOUND", "Live week was not found.");

        var tutorDefault = await _calendar.GetOrCreateTutorDefaultAsync(cancellationToken);
        // Only a week-owned blob is safe to delete — the shared default's blob (if any) is still
        // used by every other non-customized week.
        var previous = week.HasCustomTutor ? week.TutorPhotoBlobPath : null;
        LiveCalendarService.ActivateCustomTutor(week, tutorDefault);
        week.TutorPhotoBlobPath = request.BlobPath;
        week.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        if (!string.IsNullOrWhiteSpace(previous)
            && !string.Equals(previous, request.BlobPath, StringComparison.OrdinalIgnoreCase)
            && ProductImageResolver.IsBlobPath(previous))
        {
            try
            {
                await _blob.DeleteAsync(previous, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to delete previous live tutor photo {BlobPath}", previous);
            }
        }

        return Ok(await MapWeekAsync(week, tutorDefault, cancellationToken));
    }

    [HttpDelete("weeks/{weekId:guid}/tutor-photo")]
    [ProducesResponseType(typeof(AdminLiveWeekResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminLiveWeekResponse>> DeleteTutorPhoto(
        Guid weekId,
        CancellationToken cancellationToken)
    {
        var week = await _db.LiveWeeks
                .Include(w => w.Slots)
                .SingleOrDefaultAsync(w => w.Id == weekId, cancellationToken)
            ?? throw ViviException.NotFound("LIVE_WEEK_NOT_FOUND", "Live week was not found.");

        var tutorDefault = await _calendar.GetOrCreateTutorDefaultAsync(cancellationToken);
        // Only a week-owned blob is safe to delete — the shared default's blob (if any) is still
        // used by every other non-customized week.
        var previous = week.HasCustomTutor ? week.TutorPhotoBlobPath : null;
        LiveCalendarService.ActivateCustomTutor(week, tutorDefault);
        week.TutorPhotoBlobPath = null;
        week.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        if (!string.IsNullOrWhiteSpace(previous) && ProductImageResolver.IsBlobPath(previous))
        {
            try
            {
                await _blob.DeleteAsync(previous, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to delete live tutor photo {BlobPath}", previous);
            }
        }

        return Ok(await MapWeekAsync(week, tutorDefault, cancellationToken));
    }

    [HttpPut("weeks/{weekId:guid}/tutor")]
    [ProducesResponseType(typeof(AdminLiveWeekResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminLiveWeekResponse>> SetTutor(
        Guid weekId,
        [FromBody] SetLiveWeekTutorRequest request,
        CancellationToken cancellationToken)
    {
        var name = (request.TutorName ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(name))
            throw new ViviException("INVALID_TUTOR_NAME", "Tutor name is required.");
        if (name.Length > 100)
            throw new ViviException("INVALID_TUTOR_NAME", "Tutor name must be 100 characters or fewer.");

        var week = await _db.LiveWeeks
                .Include(w => w.Slots)
                .SingleOrDefaultAsync(w => w.Id == weekId, cancellationToken)
            ?? throw ViviException.NotFound("LIVE_WEEK_NOT_FOUND", "Live week was not found.");

        var tutorDefault = await _calendar.GetOrCreateTutorDefaultAsync(cancellationToken);
        LiveCalendarService.ActivateCustomTutor(week, tutorDefault);
        week.TutorName = name;
        week.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        return Ok(await MapWeekAsync(week, tutorDefault, cancellationToken));
    }

    [HttpDelete("weeks/{weekId:guid}/tutor-override")]
    [ProducesResponseType(typeof(AdminLiveWeekResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminLiveWeekResponse>> ClearTutorOverride(
        Guid weekId,
        CancellationToken cancellationToken)
    {
        var week = await _db.LiveWeeks
                .Include(w => w.Slots)
                .SingleOrDefaultAsync(w => w.Id == weekId, cancellationToken)
            ?? throw ViviException.NotFound("LIVE_WEEK_NOT_FOUND", "Live week was not found.");

        // Only a week-owned blob is safe to delete — reverting to the default never deletes the
        // shared default's own photo.
        var previous = week.HasCustomTutor ? week.TutorPhotoBlobPath : null;
        week.HasCustomTutor = false;
        week.TutorName = "SRI";
        week.TutorPhotoBlobPath = null;
        week.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        if (!string.IsNullOrWhiteSpace(previous) && ProductImageResolver.IsBlobPath(previous))
        {
            try
            {
                await _blob.DeleteAsync(previous, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to delete live tutor photo {BlobPath}", previous);
            }
        }

        var tutorDefault = await _calendar.GetOrCreateTutorDefaultAsync(cancellationToken);
        return Ok(await MapWeekAsync(week, tutorDefault, cancellationToken));
    }

    [HttpGet("settings")]
    [ProducesResponseType(typeof(AdminLiveSettingsResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminLiveSettingsResponse>> GetSettings(CancellationToken cancellationToken)
        => Ok(MapSettings(await _calendar.GetSettingsAsync(cancellationToken)));

    [HttpPut("settings")]
    [ProducesResponseType(typeof(AdminLiveSettingsResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminLiveSettingsResponse>> UpdateSettings(
        [FromBody] UpdateLiveSettingsRequest request,
        CancellationToken cancellationToken)
    {
        var snapshot = await _calendar.UpdateSettingsAsync(
            request.PackagePrice,
            request.HoursPerClassDay,
            request.Language,
            request.Level,
            request.EnquiryWhatsApp,
            request.Sessions
                .Select(s => new LiveSessionUpdate(s.SlotType, s.Name, s.Hours, s.IsEnabled))
                .ToList(),
            cancellationToken);
        return Ok(MapSettings(snapshot));
    }

    /// <summary>Every Live course, including ones switched off, in the order customers see them.</summary>
    [HttpGet("courses")]
    [ProducesResponseType(typeof(IReadOnlyList<LiveCourseResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<LiveCourseResponse>>> ListCourses(CancellationToken cancellationToken)
    {
        var courses = await _courses.ListAsync(activeOnly: false, cancellationToken);
        return Ok(courses.Select(LiveCourseMapper.ToResponse).ToList());
    }

    [HttpPut("courses/{id:guid}")]
    [ProducesResponseType(typeof(LiveCourseResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<LiveCourseResponse>> UpdateCourse(
        Guid id,
        [FromBody] UpdateLiveCourseRequest request,
        CancellationToken cancellationToken)
    {
        var course = await _courses.UpdateAsync(id, LiveCourseMapper.ToUpdate(request), cancellationToken);
        return Ok(LiveCourseMapper.ToResponse(course));
    }

    private async Task<IReadOnlyDictionary<Guid, string>> CourseNamesAsync(CancellationToken cancellationToken)
        => await _db.LiveCourses.AsNoTracking().ToDictionaryAsync(c => c.Id, c => c.Name, cancellationToken);

    [HttpPut("weeks/{weekId:guid}/overrides")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> SetWeekOverrides(
        Guid weekId,
        [FromBody] SetLiveWeekOverridesRequest request,
        CancellationToken cancellationToken)
    {
        await _calendar.SetWeekOverridesAsync(
            weekId,
            request.PriceOverride,
            request.LanguageOverride,
            request.LevelOverride,
            cancellationToken);
        return NoContent();
    }

    [HttpPut("weeks/{weekId:guid}/slots/{slotType}/hours")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> SetSlotHours(
        Guid weekId,
        LiveSlotType slotType,
        [FromBody] SetLiveSlotHoursRequest request,
        CancellationToken cancellationToken)
    {
        await _calendar.SetSlotHoursOverrideAsync(weekId, slotType, request.Hours, cancellationToken);
        return NoContent();
    }

    private static AdminLiveSettingsResponse MapSettings(LiveSettingsSnapshot settings) => new()
    {
        PackagePrice = settings.PackagePrice,
        HoursPerClassDay = settings.HoursPerClassDay,
        Language = settings.Language,
        Level = settings.Level,
        EnquiryWhatsApp = settings.EnquiryWhatsApp,
        Sessions = settings.Sessions.Values
            .OrderBy(s => s.SlotType)
            .Select(s => new AdminLiveSessionDto
            {
                SlotType = s.SlotType,
                Name = s.Name,
                Hours = s.Hours,
                IsEnabled = s.IsEnabled,
                IsCore = LiveCalendarService.IsCoreSession(s.SlotType)
            })
            .ToList()
    };

    [HttpPut("weeks/{weekId:guid}/break")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> SetBreak(
        Guid weekId,
        [FromBody] SetLiveWeekBreakRequest request,
        CancellationToken cancellationToken)
    {
        await _calendar.SetBreakAsync(weekId, request.BreakWeekday, cancellationToken);
        return NoContent();
    }

    [HttpPut("weeks/{weekId:guid}/bookable")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> SetBookable(
        Guid weekId,
        [FromBody] SetLiveWeekBookableRequest request,
        CancellationToken cancellationToken)
    {
        await _calendar.SetBookableAsync(weekId, request.IsBookable, cancellationToken);
        return NoContent();
    }

    [HttpPut("weeks/{weekId:guid}/slots/{slotType}/capacity")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> SetSlotCapacity(
        Guid weekId,
        LiveSlotType slotType,
        [FromBody] SetLiveSlotCapacityRequest request,
        CancellationToken cancellationToken)
    {
        await _calendar.SetSlotCapacityAsync(weekId, slotType, request.SeatCapacity, cancellationToken);
        return NoContent();
    }

    [HttpPut("weeks/{weekId:guid}/slots/{slotType}/blocked")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> SetSlotBlocked(
        Guid weekId,
        LiveSlotType slotType,
        [FromBody] SetLiveSlotBlockedRequest request,
        CancellationToken cancellationToken)
    {
        await _calendar.SetSlotBlockedAsync(weekId, slotType, request.IsBlocked, cancellationToken);
        return NoContent();
    }

    [HttpGet("bookings")]
    [ProducesResponseType(typeof(IReadOnlyList<AdminLiveBookingListItemResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<AdminLiveBookingListItemResponse>>> ListBookings(
        [FromQuery] LiveBookingStatus? status,
        [FromQuery] int? weekNumber,
        [FromQuery] int? seasonYear,
        [FromQuery] LiveSlotType? slotType,
        CancellationToken cancellationToken)
    {
        await _bookings.ReleaseExpiredReservationsAsync(cancellationToken);

        var query = _db.LiveBookings
            .AsNoTracking()
            .Include(b => b.Customer)
            .Include(b => b.Week)
            .Include(b => b.Order!)
            .ThenInclude(o => o.Payments)
            .AsQueryable();

        if (status.HasValue)
            query = query.Where(b => b.Status == status.Value);
        if (weekNumber.HasValue)
            query = query.Where(b => b.Week != null && b.Week.WeekNumber == weekNumber.Value);
        if (seasonYear.HasValue)
            query = query.Where(b => b.Week != null && b.Week.SeasonYear == seasonYear.Value);
        if (slotType.HasValue)
            query = query.Where(b => b.SlotType == slotType.Value);

        var bookings = await query
            .OrderByDescending(b => b.CreatedAt)
            .Take(200)
            .ToListAsync(cancellationToken);

        var names = await CourseNamesAsync(cancellationToken);
        return Ok(bookings.Select(b => MapListItem(b, names)).ToList());
    }

    [HttpGet("bookings/{id:guid}")]
    [ProducesResponseType(typeof(AdminLiveBookingDetailResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminLiveBookingDetailResponse>> GetBooking(
        Guid id,
        CancellationToken cancellationToken)
    {
        await _bookings.ReleaseExpiredReservationsAsync(cancellationToken);

        var booking = await _db.LiveBookings
            .AsNoTracking()
            .Include(b => b.Customer)
            .Include(b => b.Week!)
            .ThenInclude(w => w.Slots)
            .Include(b => b.Order!)
            .ThenInclude(o => o.Payments)
            .SingleOrDefaultAsync(b => b.Id == id, cancellationToken)
            ?? throw ViviException.NotFound("LIVE_BOOKING_NOT_FOUND", "Live booking was not found.");

        return Ok(MapDetail(booking, await CourseNamesAsync(cancellationToken)));
    }

    [HttpPost("bookings/{id:guid}/cancel")]
    [ProducesResponseType(typeof(AdminLiveBookingDetailResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminLiveBookingDetailResponse>> CancelBooking(
        Guid id,
        CancellationToken cancellationToken)
    {
        await _bookings.AdminCancelBookingAsync(id, cancellationToken);

        var booking = await _db.LiveBookings
            .AsNoTracking()
            .Include(b => b.Customer)
            .Include(b => b.Week!)
            .ThenInclude(w => w.Slots)
            .Include(b => b.Order!)
            .ThenInclude(o => o.Payments)
            .SingleAsync(b => b.Id == id, cancellationToken);

        return Ok(MapDetail(booking, await CourseNamesAsync(cancellationToken)));
    }

    /// <summary>
    /// Hard-deletes a booking (any status) for test-data cleanup. Removes its order and payments too,
    /// so the seat is freed and the payment no longer counts in revenue.
    /// </summary>
    [HttpDelete("bookings/{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> DeleteBooking(Guid id, CancellationToken cancellationToken)
    {
        var booking = await _db.LiveBookings
            .SingleOrDefaultAsync(b => b.Id == id, cancellationToken)
            ?? throw ViviException.NotFound("LIVE_BOOKING_NOT_FOUND", "Live booking was not found.");

        var orderExists = await _db.Orders.AnyAsync(o => o.Id == booking.OrderId, cancellationToken);
        if (orderExists)
        {
            await _cleanup.DeleteOrderAsync(booking.OrderId, cancellationToken);
        }
        else
        {
            _db.LiveBookings.Remove(booking);
            await _db.SaveChangesAsync(cancellationToken);
        }

        return NoContent();
    }

    private async Task<AdminLiveWeekResponse> MapWeekAsync(
        Core.Entities.LiveWeek week,
        Core.Entities.LiveTutorDefault tutorDefault,
        CancellationToken cancellationToken)
    {
        var (tutorName, tutorPhotoBlobPath) = LiveCalendarService.ResolveEffectiveTutor(week, tutorDefault);
        var tutorPhotoUrl = await ProductImageResolver.ResolveAsync(
            tutorPhotoBlobPath,
            _blob,
            cancellationToken);
        return new AdminLiveWeekResponse
        {
            Id = week.Id,
            WeekNumber = week.WeekNumber,
            SeasonYear = week.SeasonYear,
            StartDate = week.StartDate,
            EndDate = week.EndDate,
            BreakWeekday = week.BreakWeekday?.ToString(),
            IsBookable = week.IsBookable,
            PackagePrice = _calendar.PriceFor(week),
            PriceOverride = week.PriceOverride,
            Language = _calendar.LanguageFor(week),
            LanguageOverride = week.LanguageOverride,
            Level = _calendar.LevelFor(week),
            LevelOverride = week.LevelOverride,
            TutorName = tutorName,
            TutorPhotoUrl = tutorPhotoUrl,
            HasCustomTutor = week.HasCustomTutor,
            Slots = week.Slots
                .Where(s => _calendar.IsSlotEnabled(s.SlotType))
                .OrderBy(s => s.SlotType)
                .Select(MapSlot)
                .ToList()
        };
    }

    private async Task<AdminLiveTutorDefaultResponse> MapTutorDefaultAsync(
        Core.Entities.LiveTutorDefault tutorDefault,
        CancellationToken cancellationToken)
    {
        var tutorPhotoUrl = await ProductImageResolver.ResolveAsync(
            tutorDefault.TutorPhotoBlobPath,
            _blob,
            cancellationToken);
        return new AdminLiveTutorDefaultResponse
        {
            TutorName = string.IsNullOrWhiteSpace(tutorDefault.TutorName) ? "SRI" : tutorDefault.TutorName.Trim(),
            TutorPhotoUrl = tutorPhotoUrl
        };
    }

    private LiveSlotAvailabilityResponse MapSlot(Core.Entities.LiveWeekSlot slot)
    {
        var remaining = Math.Max(0, slot.SeatCapacity - slot.SeatsBooked);
        var status = slot.IsBlocked
            ? "Blocked"
            : remaining == 0
                ? "FullyBooked"
                : "Available";
        return new LiveSlotAvailabilityResponse
        {
            SlotType = slot.SlotType.ToString(),
            Name = _calendar.SlotName(slot.SlotType),
            Hours = _calendar.SlotHoursFor(slot),
            HoursOverride = slot.HoursOverride,
            SeatCapacity = slot.SeatCapacity,
            SeatsBooked = slot.SeatsBooked,
            SeatsRemaining = slot.IsBlocked ? 0 : remaining,
            IsBlocked = slot.IsBlocked,
            Status = status
        };
    }

    private AdminLiveBookingListItemResponse MapListItem(
        Core.Entities.LiveBooking booking,
        IReadOnlyDictionary<Guid, string> courseNames)
    {
        var week = booking.Week ?? throw ViviException.Conflict("LIVE_WEEK_MISSING", "Booking week is missing.");
        var weeksHeld = Math.Max(1, booking.WeeksHeld);
        var payment = booking.Order?.Payments.OrderByDescending(p => p.CreatedAt).FirstOrDefault();
        return new AdminLiveBookingListItemResponse
        {
            Id = booking.Id,
            Status = booking.Status.ToString(),
            CustomerName = CommerceMapper.DisplayCustomerName(booking.Customer),
            CustomerPhone = booking.Customer?.PhoneNumber ?? string.Empty,
            CustomerEmail = booking.Customer?.Email ?? string.Empty,
            WeekNumber = week.WeekNumber,
            SeasonYear = week.SeasonYear,
            StartDate = week.StartDate,
            EndDate = week.StartDate.AddDays(7 * weeksHeld - 1),
            SlotType = booking.SlotType.ToString(),
            SlotName = _calendar.SlotName(booking.SlotType),
            CourseName = booking.CourseId is { } courseId ? courseNames.GetValueOrDefault(courseId) : null,
            WeeksHeld = weeksHeld,
            OrderId = booking.OrderId,
            OrderNumber = booking.Order?.OrderNumber ?? string.Empty,
            TotalAmount = booking.Order?.TotalAmount
                ?? (booking.Week is { } bookedWeek ? _calendar.PriceFor(bookedWeek) : _calendar.PackagePrice),
            PaymentStatus = payment?.Status.ToString(),
            CreatedAt = booking.CreatedAt,
            ConfirmedAt = booking.ConfirmedAt
        };
    }

    private AdminLiveBookingDetailResponse MapDetail(
        Core.Entities.LiveBooking booking,
        IReadOnlyDictionary<Guid, string> courseNames)
    {
        var list = MapListItem(booking, courseNames);
        var week = booking.Week!;
        var slot = week.Slots.SingleOrDefault(s => s.SlotType == booking.SlotType);
        var remaining = slot is null ? 0 : Math.Max(0, slot.SeatCapacity - slot.SeatsBooked);

        return new AdminLiveBookingDetailResponse
        {
            Id = list.Id,
            Status = list.Status,
            CustomerName = list.CustomerName,
            CustomerPhone = list.CustomerPhone,
            CustomerEmail = list.CustomerEmail,
            WeekNumber = list.WeekNumber,
            SeasonYear = list.SeasonYear,
            StartDate = list.StartDate,
            EndDate = list.EndDate,
            SlotType = list.SlotType,
            SlotName = list.SlotName,
            CourseName = list.CourseName,
            WeeksHeld = list.WeeksHeld,
            OrderId = list.OrderId,
            OrderNumber = list.OrderNumber,
            TotalAmount = list.TotalAmount,
            PaymentStatus = list.PaymentStatus,
            CreatedAt = list.CreatedAt,
            ConfirmedAt = list.ConfirmedAt,
            ReservationExpiresAt = booking.ReservationExpiresAt,
            SeatCapacity = slot?.SeatCapacity ?? 0,
            SeatsBooked = slot?.SeatsBooked ?? 0,
            SeatsRemaining = remaining,
            BreakWeekday = week.BreakWeekday?.ToString(),
            IsBookable = week.IsBookable,
            Days = _calendar.BuildDayPlan(week).Select(d => new LiveDayResponse
            {
                Date = d.Date,
                Weekday = d.Weekday.ToString().ToUpperInvariant()[..3],
                Kind = d.Kind.ToString(),
                Label = d.Label
            }).ToList()
        };
    }
}
