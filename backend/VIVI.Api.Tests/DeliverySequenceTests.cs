using Microsoft.EntityFrameworkCore;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Commerce;
using VIVI.Infrastructure.Data;
using Xunit;

namespace VIVI.Api.Tests;

/// <summary>
/// Delivery sequencing with fixed dates (30 Sep 2026 onward, IST).
/// Only HANDMADE orders chain; Crochet Essentials keep their standard 1-2 day window.
/// </summary>
public sealed class DeliverySequenceTests
{
    private readonly ViviDbContext _db = new(
        new DbContextOptionsBuilder<ViviDbContext>()
            .UseInMemoryDatabase($"delivery-seq-{Guid.NewGuid()}")
            .Options);
    private readonly DeliveryEstimateService _estimate = new();
    private readonly DeliverySequenceService _sequence;
    private readonly Guid _customer = Guid.NewGuid();

    public DeliverySequenceTests()
    {
        _sequence = new DeliverySequenceService(_db, _estimate);
    }

    // 12:00 IST on the given day, as a UTC instant.
    private static DateTime At(int month, int day) => new(2026, month, day, 6, 30, 0, DateTimeKind.Utc);
    private static DateTime Day(int month, int day) => new(2026, month, day);

    private DeliveryWindow Window(ProductType type, bool coimbatore) => _estimate.WindowFor(type, coimbatore);

    /// <summary>Plans and stores an order placed on the given day.</summary>
    private async Task<(Order Order, DeliveryPlan Plan)> PlaceAsync(
        DateTime placedUtc,
        ProductType type = ProductType.Handmade,
        bool coimbatore = true,
        OrderStatus status = OrderStatus.Confirmed,
        bool physical = true)
    {
        var product = new Product { Id = Guid.NewGuid(), Name = "P", ProductType = type, Status = ProductStatus.Published };
        var order = new Order
        {
            Id = Guid.NewGuid(),
            OrderNumber = $"T-{Guid.NewGuid():N}"[..14],
            CustomerId = _customer,
            Status = status,
            CreatedAt = placedUtc,
            UpdatedAt = placedUtc,
            PaidAt = status is OrderStatus.PendingPayment or OrderStatus.PaymentFailed ? null : placedUtc
        };
        order.Items.Add(new OrderItem
        {
            Id = Guid.NewGuid(),
            OrderId = order.Id,
            ItemType = physical ? OrderItemType.Product : OrderItemType.Course,
            ProductId = physical ? product.Id : null,
            CourseId = physical ? null : Guid.NewGuid(),
            Quantity = 1
        });

        var standard = Window(type, coimbatore);
        var plan = await _sequence.PlanAsync(
            _customer, standard, placedUtc, order.Id, type == ProductType.Handmade, CancellationToken.None);
        if (physical)
            _estimate.ApplyEstimate(order, plan.Dates, plan.Window, coimbatore);
        _db.Products.Add(product);
        _db.Orders.Add(order);
        await _db.SaveChangesAsync();
        return (order, plan);
    }

    [Fact]
    public async Task Test1_first_handmade_coimbatore_order_is_one_to_two_days()
    {
        var (_, plan) = await PlaceAsync(At(9, 30));
        Assert.False(plan.IsRepeatOrder);
        Assert.Equal(Day(10, 1), plan.Dates.From);
        Assert.Equal(Day(10, 2), plan.Dates.To);
    }

    [Fact]
    public async Task Test2_first_handmade_order_outside_coimbatore_is_two_to_three_days()
    {
        var (_, plan) = await PlaceAsync(At(9, 30), coimbatore: false);
        Assert.False(plan.IsRepeatOrder);
        Assert.Equal(Day(10, 2), plan.Dates.From);
        Assert.Equal(Day(10, 3), plan.Dates.To);
    }

    [Fact]
    public async Task Test3_and_4_handmade_orders_chain_two_days_apart()
    {
        await PlaceAsync(At(9, 30)); // 1-2 Oct, effective 2 Oct
        var (_, second) = await PlaceAsync(At(10, 1));
        Assert.True(second.IsRepeatOrder);
        Assert.Equal(Day(10, 4), second.Dates.From);
        Assert.Equal(Day(10, 4), second.Dates.To);

        var (_, third) = await PlaceAsync(At(10, 2));
        Assert.Equal(Day(10, 6), third.Dates.To);
    }

    [Fact]
    public async Task Handmade_outside_coimbatore_chains_from_its_effective_date()
    {
        await PlaceAsync(At(9, 30), coimbatore: false); // effective 3 Oct
        var (_, second) = await PlaceAsync(At(10, 1), coimbatore: false);
        Assert.Equal(Day(10, 5), second.Dates.To);
    }

    [Fact]
    public async Task Test5_admin_override_of_previous_handmade_order_is_the_source()
    {
        var (first, _) = await PlaceAsync(At(9, 30)); // system 2 Oct
        first.ManualDeliveryDateFrom = Day(10, 4);
        first.ManualDeliveryDateTo = Day(10, 4);
        await _db.SaveChangesAsync();

        var (_, second) = await PlaceAsync(At(10, 1));
        Assert.Equal(Day(10, 6), second.Dates.To);
        // The original calculated estimate is untouched.
        Assert.Equal(Day(10, 2), first.EstimatedDeliveryDateTo);
    }

    [Fact]
    public async Task Test6_previous_essentials_order_does_not_count_for_a_first_handmade_order()
    {
        await PlaceAsync(At(9, 30), ProductType.Resell);
        var (_, handmade) = await PlaceAsync(At(10, 1));
        Assert.False(handmade.IsRepeatOrder);
        Assert.Equal(Day(10, 2), handmade.Dates.From);
        Assert.Equal(Day(10, 3), handmade.Dates.To);
    }

    [Fact]
    public async Task Test7_essentials_after_handmade_keeps_its_own_logic()
    {
        await PlaceAsync(At(9, 30)); // handmade, effective 2 Oct
        var (_, essentials) = await PlaceAsync(At(10, 1), ProductType.Resell);
        Assert.False(essentials.IsRepeatOrder);
        Assert.Equal(Day(10, 2), essentials.Dates.From); // 1 Oct + 1
        Assert.Equal(Day(10, 3), essentials.Dates.To);   // 1 Oct + 2
    }

    [Fact]
    public async Task Essentials_delivery_is_one_to_two_days_everywhere_and_never_chains()
    {
        var (_, first) = await PlaceAsync(At(9, 30), ProductType.Resell, coimbatore: false);
        var (_, second) = await PlaceAsync(At(9, 30), ProductType.Resell, coimbatore: false);
        Assert.Equal(Day(10, 1), first.Dates.From);
        Assert.Equal(Day(10, 2), first.Dates.To);
        Assert.Equal(first.Dates, second.Dates);
    }

    [Fact]
    public async Task Test8_essentials_between_two_handmade_orders_is_ignored()
    {
        await PlaceAsync(At(9, 30));                     // handmade, effective 2 Oct
        await PlaceAsync(At(10, 1), ProductType.Resell); // essentials, effective 3 Oct
        var (_, second) = await PlaceAsync(At(10, 1));   // handmade
        Assert.True(second.IsRepeatOrder);
        Assert.Equal(Day(10, 4), second.Dates.To);       // 2 Oct + 2, not 3 Oct + 2
    }

    [Theory]
    [InlineData(OrderStatus.PendingPayment)]
    [InlineData(OrderStatus.PaymentFailed)]
    [InlineData(OrderStatus.Cancelled)]
    public async Task Test9_unpaid_failed_or_cancelled_handmade_orders_are_ignored(OrderStatus status)
    {
        await PlaceAsync(At(9, 30), status: status);
        var (_, plan) = await PlaceAsync(At(10, 1));
        Assert.False(plan.IsRepeatOrder);
    }

    [Fact]
    public async Task Course_orders_do_not_affect_handmade_delivery()
    {
        await PlaceAsync(At(9, 30), physical: false);
        var (_, plan) = await PlaceAsync(At(10, 1));
        Assert.False(plan.IsRepeatOrder);
        Assert.Equal(Day(10, 2), plan.Dates.From);
        Assert.Equal(Day(10, 3), plan.Dates.To);
    }

    [Fact]
    public async Task Same_day_handmade_orders_get_consecutive_dates()
    {
        var (_, first) = await PlaceAsync(At(9, 30));
        var (_, second) = await PlaceAsync(At(9, 30));
        var (_, third) = await PlaceAsync(At(9, 30));

        Assert.Equal(Day(10, 2), first.Dates.To);
        Assert.Equal(first.Dates.To.AddDays(2), second.Dates.To);
        Assert.Equal(first.Dates.To.AddDays(4), third.Dates.To);
    }

    [Fact]
    public async Task Old_delivery_dates_do_not_pull_new_orders_into_the_past()
    {
        await PlaceAsync(At(9, 30)); // delivered 2 Oct
        var (_, later) = await PlaceAsync(At(12, 1)); // months later
        Assert.False(later.IsRepeatOrder);
        Assert.Equal(Day(12, 2), later.Dates.From);
    }

    [Theory]
    [InlineData("Coimbatore", true)]
    [InlineData("COIMBATORE", true)]
    [InlineData("Coimbatore, Tamil Nadu", true)]
    [InlineData("Chennai", false)]
    [InlineData("Erode", false)]
    public void City_decides_the_location_not_the_state(string city, bool expected)
    {
        var address = new ShippingAddressInput("A", "9876543210", "1 Main Rd", null, null, city, "Tamil Nadu", "641001");
        Assert.Equal(expected, _estimate.IsCoimbatore(address));
    }

    [Fact]
    public void Coimbatore_in_an_address_line_does_not_make_another_city_coimbatore()
    {
        var address = new ShippingAddressInput(
            "A", "9876543210", "Near Coimbatore road", null, "Coimbatore bus stand", "Chennai", "Tamil Nadu", "600001");
        Assert.False(_estimate.IsCoimbatore(address));
    }
}
