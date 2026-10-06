using Microsoft.Extensions.Options;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Infrastructure.Commerce;
using VIVI.Infrastructure.Configuration;
using Xunit;

namespace VIVI.Api.Tests;

public sealed class CustomerCancellationTests
{
    private static readonly TimeSpan Ist = TimeSpan.FromMinutes(330);

    private static OrderCancellationService Service(int cutoffHour = 17) =>
        new(null!, null!, null!, null!, Options.Create(new OrderCancellationOptions { CutoffHourIst = cutoffHour }));

    // Builds a UTC instant from an India wall-clock time.
    private static DateTime IstTime(int day, int hour, int minute = 0) =>
        new DateTime(2026, 10, day, hour, minute, 0, DateTimeKind.Unspecified) - Ist;

    private static Order PaidOrder(DateTime paidUtc, OrderStatus status = OrderStatus.Confirmed, OrderItemType type = OrderItemType.Product) =>
        new()
        {
            Status = status,
            PaidAt = paidUtc,
            Items = new List<OrderItem> { new() { ItemType = type } }
        };

    [Fact]
    public void Order_paid_before_five_pm_can_be_cancelled_until_five_pm_that_day()
    {
        var order = PaidOrder(IstTime(5, 14));
        Assert.Equal(IstTime(5, 17), Service().CustomerCancelDeadlineUtc(order));
        Assert.True(Service().CanCustomerCancel(order, IstTime(5, 16, 59)));
        Assert.False(Service().CanCustomerCancel(order, IstTime(5, 17)));
        Assert.False(Service().CanCustomerCancel(order, IstTime(5, 18)));
    }

    [Fact]
    public void Order_paid_after_five_pm_can_be_cancelled_until_five_pm_next_day()
    {
        var order = PaidOrder(IstTime(5, 18));
        Assert.Equal(IstTime(6, 17), Service().CustomerCancelDeadlineUtc(order));
        Assert.True(Service().CanCustomerCancel(order, IstTime(6, 10)));
        Assert.False(Service().CanCustomerCancel(order, IstTime(6, 17, 1)));
    }

    [Fact]
    public void Order_paid_exactly_at_five_pm_belongs_to_the_next_batch()
    {
        var order = PaidOrder(IstTime(5, 17));
        Assert.Equal(IstTime(6, 17), Service().CustomerCancelDeadlineUtc(order));
    }

    [Fact]
    public void Cutoff_hour_is_configurable()
    {
        var order = PaidOrder(IstTime(5, 10));
        Assert.Equal(IstTime(5, 12), Service(12).CustomerCancelDeadlineUtc(order));
    }

    [Theory]
    [InlineData(OrderStatus.PendingPayment)]
    [InlineData(OrderStatus.InProduction)]
    [InlineData(OrderStatus.Shipped)]
    [InlineData(OrderStatus.Delivered)]
    [InlineData(OrderStatus.Cancelled)]
    [InlineData(OrderStatus.PaymentFailed)]
    public void Only_paid_or_confirmed_orders_can_be_cancelled(OrderStatus status)
    {
        var order = PaidOrder(IstTime(5, 10), status);
        Assert.False(Service().CanCustomerCancel(order, IstTime(5, 11)));
    }

    [Theory]
    [InlineData(OrderItemType.Course)]
    [InlineData(OrderItemType.CourseBundle)]
    [InlineData(OrderItemType.LivePackage)]
    public void Non_product_orders_cannot_be_cancelled_by_the_customer(OrderItemType type)
    {
        var order = PaidOrder(IstTime(5, 10), type: type);
        Assert.False(Service().CanCustomerCancel(order, IstTime(5, 11)));
    }

    [Fact]
    public void Unpaid_order_has_no_deadline()
    {
        var order = new Order { Status = OrderStatus.Confirmed, Items = new List<OrderItem> { new() { ItemType = OrderItemType.Product } } };
        Assert.Null(Service().CustomerCancelDeadlineUtc(order));
        Assert.False(Service().CanCustomerCancel(order));
    }
}
