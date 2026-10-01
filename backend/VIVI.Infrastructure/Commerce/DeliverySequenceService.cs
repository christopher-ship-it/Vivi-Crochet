using Microsoft.EntityFrameworkCore;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Data;

namespace VIVI.Infrastructure.Commerce;

/// <summary>The delivery dates chosen for a physical order, and whether the repeat-order rule applied.</summary>
public sealed record DeliveryPlan(
    DeliveryDateRange Dates,
    DeliveryWindow Window,
    bool IsRepeatOrder,
    DateTime? PreviousEffectiveDelivery);

/// <summary>
/// Chooses delivery dates for physical orders.
///
/// HANDMADE orders are sequenced per customer: the first one uses the standard window from the
/// order day (Coimbatore 1–2 days, other cities 2–3 days); each later one is the customer's previous
/// HANDMADE order's EFFECTIVE delivery date + 2 days (a manual admin override counts, not the
/// original estimate). Crochet Essentials orders are never chained and never used as "previous".
/// </summary>
public sealed class DeliverySequenceService
{
    /// <summary>Days added to the previous order's effective delivery date.</summary>
    public const int RepeatOrderGapDays = 2;

    // Successfully paid orders. Pending / failed / cancelled orders never count.
    private static readonly OrderStatus[] RelevantStatuses =
    [
        OrderStatus.Paid,
        OrderStatus.Confirmed,
        OrderStatus.InProduction,
        OrderStatus.Shipped,
        OrderStatus.Delivered
    ];

    // In-process fallback for databases without application locks (tests / non-SQL Server).
    private static readonly System.Collections.Concurrent.ConcurrentDictionary<Guid, SemaphoreSlim> LocalLocks = new();

    private readonly ViviDbContext _db;
    private readonly IDeliveryEstimateService _delivery;

    public DeliverySequenceService(ViviDbContext db, IDeliveryEstimateService delivery)
    {
        _db = db;
        _delivery = delivery;
    }

    /// <summary>
    /// Serialises delivery sequencing per customer so two orders paid at nearly the same moment cannot
    /// both pick the same "previous" order. On SQL Server this is a transaction-scoped application lock
    /// (released on commit/rollback); elsewhere an in-process lock held until the returned lease is
    /// disposed - dispose it AFTER the order has been saved.
    /// </summary>
    public async Task<IAsyncDisposable> LockCustomerAsync(Guid customerId, CancellationToken cancellationToken)
    {
        if (!_db.Database.IsSqlServer())
        {
            var gate = LocalLocks.GetOrAdd(customerId, _ => new SemaphoreSlim(1, 1));
            await gate.WaitAsync(cancellationToken);
            return new LocalLease(gate);
        }

        if (_db.Database.CurrentTransaction is null)
            return NoLease.Instance;

        var resource = $"vivi-delivery-{customerId:N}";
        await _db.Database.ExecuteSqlInterpolatedAsync(
            $@"DECLARE @r int;
               EXEC @r = sp_getapplock @Resource = {resource}, @LockMode = 'Exclusive',
                    @LockOwner = 'Transaction', @LockTimeout = 30000;
               IF @r < 0 THROW 51000, 'Could not lock the customer delivery sequence.', 1;",
            cancellationToken);
        return NoLease.Instance;
    }

    private sealed class LocalLease(SemaphoreSlim gate) : IAsyncDisposable
    {
        public ValueTask DisposeAsync()
        {
            gate.Release();
            return ValueTask.CompletedTask;
        }
    }

    private sealed class NoLease : IAsyncDisposable
    {
        public static readonly NoLease Instance = new();
        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }

    /// <param name="chainWithPreviousHandmade">
    /// True only when the order contains a Handmade product. Essentials-only orders keep the
    /// standard window and ignore the customer history.
    /// </param>
    public async Task<DeliveryPlan> PlanAsync(
        Guid? customerId,
        DeliveryWindow standardWindow,
        DateTime utcAnchor,
        Guid? excludeOrderId,
        bool chainWithPreviousHandmade,
        CancellationToken cancellationToken)
    {
        var today = _delivery.IstDate(utcAnchor);

        if (chainWithPreviousHandmade && customerId is Guid id)
        {
            var previousEnd = await GetPreviousEffectiveDeliveryAsync(id, excludeOrderId, cancellationToken);

            // A previous delivery date that has already passed is history, not a queue to join.
            if (previousEnd is DateTime end && end >= today)
            {
                var date = end.AddDays(RepeatOrderGapDays);
                var days = (date - today).Days;
                return new DeliveryPlan(
                    new DeliveryDateRange(date, date),
                    new DeliveryWindow(days, days),
                    IsRepeatOrder: true,
                    PreviousEffectiveDelivery: end);
            }
        }

        return new DeliveryPlan(
            _delivery.ToCalendarDates(standardWindow, utcAnchor),
            standardWindow,
            IsRepeatOrder: false,
            PreviousEffectiveDelivery: null);
    }

    /// <summary>
    /// Effective delivery date (the END of the effective range) of the customer's most recently paid
    /// HANDMADE order. Essentials, course-only, live, unpaid, failed and cancelled orders are ignored.
    /// </summary>
    public async Task<DateTime?> GetPreviousEffectiveDeliveryAsync(
        Guid customerId,
        Guid? excludeOrderId,
        CancellationToken cancellationToken)
    {
        var candidates = await _db.Orders
            .AsNoTracking()
            .Where(o => o.CustomerId == customerId
                        && (excludeOrderId == null || o.Id != excludeOrderId)
                        && RelevantStatuses.Contains(o.Status)
                        && o.PaidAt != null
                        && o.Items.Any(i => i.ItemType == OrderItemType.Product
                                            && i.Product != null
                                            && i.Product.ProductType == ProductType.Handmade))
            .OrderByDescending(o => o.PaidAt)
            .ThenByDescending(o => o.CreatedAt)
            .Take(10)
            .ToListAsync(cancellationToken);

        // Most recently paid order first; if two share a payment time, the later delivery date wins.
        var dated = new List<(DateTime PaidAt, DateTime End)>();
        foreach (var order in candidates)
        {
            try
            {
                dated.Add((order.PaidAt!.Value, _delivery.GetEffectiveDates(order).To.Date));
            }
            catch (ViviException)
            {
                // Older order with no delivery estimate — look at the ones before it.
            }
        }

        return dated.Count == 0
            ? null
            : dated.OrderByDescending(d => d.PaidAt).ThenByDescending(d => d.End).First().End;
    }
}
