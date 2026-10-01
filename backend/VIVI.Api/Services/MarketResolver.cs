using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using VIVI.Api.Extensions;
using VIVI.Core;
using VIVI.Core.Enums;
using VIVI.Infrastructure.Data;

namespace VIVI.Api.Services;

/// <summary>
/// Decides which market (country / currency) a request is for.
/// A signed-in customer's saved country always wins. Guests (and accounts that never chose a country)
/// use the country the app sends in the X-Vivi-Country header, which only affects what they SEE:
/// checkout always re-reads the country saved on the customer.
/// </summary>
public sealed class MarketResolver
{
    public const string HeaderName = "X-Vivi-Country";

    private readonly ViviDbContext _db;

    public MarketResolver(ViviDbContext db) => _db = db;

    public async Task<Market> ResolveAsync(ClaimsPrincipal user, HttpRequest request, CancellationToken cancellationToken)
    {
        if (user.Identity?.IsAuthenticated == true && user.IsInRole(nameof(UserRole.Customer)))
        {
            var userId = user.GetUserId();
            var saved = await _db.Customers
                .AsNoTracking()
                .Where(c => c.UserId == userId)
                .Select(c => c.CountryCode)
                .SingleOrDefaultAsync(cancellationToken);
            if (!string.IsNullOrWhiteSpace(saved))
                return Markets.For(saved);
        }

        return Markets.For(request.Headers[HeaderName].FirstOrDefault());
    }
}
