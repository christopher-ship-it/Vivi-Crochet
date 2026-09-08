using Microsoft.EntityFrameworkCore;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Data;

namespace VIVI.Infrastructure.Commerce;

public sealed class CourseAccessService : ICourseAccessService
{
    private readonly ViviDbContext _db;

    public CourseAccessService(ViviDbContext db) => _db = db;

    public async Task<bool> HasActiveEnrollmentAsync(
        Guid customerId,
        Guid courseId,
        DateTime utcNow,
        CancellationToken cancellationToken)
    {
        return await _db.CourseEnrollments
            .AsNoTracking()
            .AnyAsync(
                e => e.CustomerId == customerId
                     && e.CourseId == courseId
                     && e.AccessStartDate <= utcNow
                     && e.AccessExpiryDate > utcNow,
                cancellationToken);
    }
}
