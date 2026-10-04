using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VIVI.Api.Auth;
using VIVI.Api.DTOs.Live;
using VIVI.Api.Mapping;
using VIVI.Api.Services;
using VIVI.Core;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Commerce;
using VIVI.Infrastructure.Data;

namespace VIVI.Api.Controllers;

[ApiController]
[Route("api/admin/live")]
[Authorize(Roles = AuthRoles.Console)]
public sealed class AdminLiveController : ControllerBase
{
    private readonly ViviDbContext _db;
    private readonly LiveCalendarService _calendar;
    private readonly LiveBookingService _bookings;
    private readonly IBlobStorageService _blob;
    private readonly AdminDataCleanupService _cleanup;
    private readonly ILogger<AdminLiveController> _logger;

    public AdminLiveController(
        ViviDbContext db,
        LiveCalendarService calendar,
        LiveBookingService bookings,
        IBlobStorageService blob,
        AdminDataCleanupService cleanup,
        ILogger<AdminLiveController> logger)
    {
        _db = db;
        _calendar = calendar;
        _bookings = bookings;
        _blob = blob;
        _cleanup = cleanup;
        _logger = logger;
    }

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
            request.Sessions
                .Select(s => new LiveSessionUpdate(s.SlotType, s.Name, s.Hours, s.IsEnabled))
                .ToList(),
            cancellationToken);
        return Ok(MapSettings(snapshot));
    }

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

        return Ok(bookings.Select(MapListItem).ToList());
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

        return Ok(MapDetail(booking));
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

        return Ok(MapDetail(booking));
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

    private AdminLiveBookingListItemResponse MapListItem(Core.Entities.LiveBooking booking)
    {
        var week = booking.Week ?? throw ViviException.Conflict("LIVE_WEEK_MISSING", "Booking week is missing.");
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
            EndDate = week.EndDate,
            SlotType = booking.SlotType.ToString(),
            SlotName = _calendar.SlotName(booking.SlotType),
            OrderId = booking.OrderId,
            OrderNumber = booking.Order?.OrderNumber ?? string.Empty,
            TotalAmount = booking.Order?.TotalAmount
                ?? (booking.Week is { } bookedWeek ? _calendar.PriceFor(bookedWeek) : _calendar.PackagePrice),
            PaymentStatus = payment?.Status.ToString(),
            CreatedAt = booking.CreatedAt,
            ConfirmedAt = booking.ConfirmedAt
        };
    }

    private AdminLiveBookingDetailResponse MapDetail(Core.Entities.LiveBooking booking)
    {
        var list = MapListItem(booking);
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
