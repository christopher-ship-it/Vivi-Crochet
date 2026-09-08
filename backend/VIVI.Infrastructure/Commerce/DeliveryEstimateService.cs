using System.Globalization;
using System.Text.RegularExpressions;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Core.Interfaces;

namespace VIVI.Infrastructure.Commerce;

public sealed class DeliveryEstimateService : IDeliveryEstimateService
{
    private static readonly HashSet<string> OnlineAliases = new(StringComparer.OrdinalIgnoreCase)
    {
        "online",
        "onlinepayment",
        "payonline",
        "razorpay",
        "prepaid"
    };

    private static readonly HashSet<string> CodAliases = new(StringComparer.OrdinalIgnoreCase)
    {
        "cod",
        "cashondelivery",
        "cash",
        "cashpayment",
        "payondelivery",
        "pod"
    };

    public void EnsureOnlinePaymentOrThrow(string? paymentMethod)
    {
        if (string.IsNullOrWhiteSpace(paymentMethod))
            return;

        var key = NormalizeMethod(paymentMethod);
        if (OnlineAliases.Contains(key))
            return;

        if (CodAliases.Contains(key) || key.Contains("cod") || key.Contains("cash"))
        {
            throw ViviException.Conflict(
                "COD_NOT_ALLOWED",
                "VIVI Crochet accepts online payment only. Cash on delivery is not available.");
        }

        throw ViviException.Conflict(
            "PAYMENT_METHOD_NOT_ALLOWED",
            "VIVI Crochet accepts online payment only.");
    }

    public bool IsCoimbatore(ShippingAddressInput address)
    {
        return ContainsCoimbatoreToken(address.City)
               || ContainsCoimbatoreToken(address.AddressLine1)
               || ContainsCoimbatoreToken(address.AddressLine2)
               || ContainsCoimbatoreToken(address.Landmark);
    }

    public DeliveryWindow WindowFor(ProductType productType, bool isCoimbatore)
        => productType switch
        {
            ProductType.Handmade when isCoimbatore => new DeliveryWindow(1, 1),
            ProductType.Handmade => new DeliveryWindow(2, 3),
            ProductType.Resell => new DeliveryWindow(1, 2),
            _ => new DeliveryWindow(1, 2)
        };

    public DeliveryWindow Combine(IEnumerable<DeliveryWindow> windows)
    {
        var list = windows.ToList();
        if (list.Count == 0)
            throw ViviException.Conflict("DELIVERY_EMPTY", "No physical products to estimate delivery for.");

        return new DeliveryWindow(list.Max(w => w.MinDays), list.Max(w => w.MaxDays));
    }

    public DeliveryDateRange ToCalendarDates(DeliveryWindow window, DateTime utcAnchor)
    {
        var istDate = ToIstDate(utcAnchor);
        return new DeliveryDateRange(
            istDate.AddDays(window.MinDays),
            istDate.AddDays(window.MaxDays));
    }

    public DeliveryDateRange GetSystemDates(Order order)
    {
        if (order.EstimatedDeliveryDateFrom is DateTime from && order.EstimatedDeliveryDateTo is DateTime to)
            return new DeliveryDateRange(from.Date, to.Date);

        if (order.DeliveryEstimateMinDays is int min && order.DeliveryEstimateMaxDays is int max)
        {
            var anchor = order.PaidAt ?? order.ConfirmedAt ?? order.CreatedAt;
            return ToCalendarDates(new DeliveryWindow(min, max), anchor);
        }

        throw ViviException.Conflict("DELIVERY_MISSING", "This order has no delivery estimate.");
    }

    public DeliveryDateRange GetEffectiveDates(Order order)
        => HasManualOverride(order)
            ? new DeliveryDateRange(order.ManualDeliveryDateFrom!.Value.Date, order.ManualDeliveryDateTo!.Value.Date)
            : GetSystemDates(order);

    public bool HasManualOverride(Order order)
        => order.ManualDeliveryDateFrom.HasValue && order.ManualDeliveryDateTo.HasValue;

    public string FormatWindowSummary(DeliveryWindow window)
    {
        if (window.MinDays == 1 && window.MaxDays == 1)
            return "Tomorrow";
        if (window.MinDays == window.MaxDays)
            return window.MinDays == 1 ? "1 day" : $"{window.MinDays} days";
        return $"{window.MinDays}–{window.MaxDays} days";
    }

    public string FormatDateRange(DateTime from, DateTime to)
    {
        var start = from.Date;
        var end = to.Date;
        if (start == end)
            return start.ToString("d MMM", CultureInfo.InvariantCulture);
        if (start.Month == end.Month && start.Year == end.Year)
            return $"{start.Day}–{end.ToString("d MMM", CultureInfo.InvariantCulture)}";
        return $"{start.ToString("d MMM", CultureInfo.InvariantCulture)} – {end.ToString("d MMM", CultureInfo.InvariantCulture)}";
    }

    public string CustomerDeliveryLabel(Order order)
    {
        if (!order.DeliveryEstimateMinDays.HasValue && !order.EstimatedDeliveryDateFrom.HasValue)
            return string.Empty;

        var range = GetEffectiveDates(order);
        var dates = FormatDateRange(range.From, range.To);
        return HasManualOverride(order)
            ? $"Expected delivery: {dates}"
            : $"Estimated delivery: {dates}";
    }

    public void ApplySystemEstimate(Order order, DeliveryWindow window, bool isCoimbatore, DateTime utcAnchor)
    {
        var dates = ToCalendarDates(window, utcAnchor);
        order.IsCoimbatoreDelivery = isCoimbatore;
        order.DeliveryEstimateMinDays = window.MinDays;
        order.DeliveryEstimateMaxDays = window.MaxDays;
        order.EstimatedDeliveryDateFrom = dates.From;
        order.EstimatedDeliveryDateTo = dates.To;
    }

    public void ApplyConfirmedDates(Order order, DateTime paidAtUtc)
    {
        if (order.DeliveryEstimateMinDays is not int min || order.DeliveryEstimateMaxDays is not int max)
            return;

        var dates = ToCalendarDates(new DeliveryWindow(min, max), paidAtUtc);
        order.EstimatedDeliveryDateFrom = dates.From;
        order.EstimatedDeliveryDateTo = dates.To;
    }

    private static bool ContainsCoimbatoreToken(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return false;

        var tokens = Regex.Split(value.Trim(), @"[\s,./\-]+")
            .Where(t => t.Length > 0);
        return tokens.Any(t => t.Equals("coimbatore", StringComparison.OrdinalIgnoreCase));
    }

    private static string NormalizeMethod(string value)
        => Regex.Replace(value.Trim().ToLowerInvariant(), @"[\s_\-]+", string.Empty);

    internal static DateTime ToIstDate(DateTime utcAnchor)
    {
        var utc = utcAnchor.Kind == DateTimeKind.Unspecified
            ? DateTime.SpecifyKind(utcAnchor, DateTimeKind.Utc)
            : utcAnchor.ToUniversalTime();
        var ist = TimeZoneInfo.ConvertTimeFromUtc(utc, IndiaTimeZone);
        return ist.Date;
    }

    private static readonly TimeZoneInfo IndiaTimeZone = ResolveIndiaTimeZone();

    private static TimeZoneInfo ResolveIndiaTimeZone()
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById("India Standard Time");
        }
        catch (TimeZoneNotFoundException)
        {
            return TimeZoneInfo.FindSystemTimeZoneById("Asia/Kolkata");
        }
    }
}
