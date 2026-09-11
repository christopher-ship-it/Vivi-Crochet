using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VIVI.Api.DTOs.Orders;
using VIVI.Api.Extensions;
using VIVI.Api.Mapping;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Data;
using VIVI.Infrastructure.Email;

namespace VIVI.Api.Controllers;

[ApiController]
[Route("api/admin/orders")]
[Authorize(Roles = nameof(UserRole.Admin))]
public sealed class AdminOrdersController : ControllerBase
{
    private readonly ViviDbContext _db;
    private readonly IDeliveryEstimateService _delivery;
    private readonly TransactionalEmailService _emails;

    public AdminOrdersController(
        ViviDbContext db,
        IDeliveryEstimateService delivery,
        TransactionalEmailService emails)
    {
        _db = db;
        _delivery = delivery;
        _emails = emails;
    }

    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<AdminOrderListItemResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<AdminOrderListItemResponse>>> List(CancellationToken cancellationToken)
    {
        var orders = await _db.Orders
            .AsNoTracking()
            .Include(o => o.Items)
            .Include(o => o.Payments)
            .Include(o => o.Customer)
            .OrderByDescending(o => o.CreatedAt)
            .Take(200)
            .ToListAsync(cancellationToken);

        return Ok(orders.Select(o => o.ToAdminListItem(_delivery)).ToList());
    }

    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(AdminOrderDetailResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminOrderDetailResponse>> Get(Guid id, CancellationToken cancellationToken)
    {
        var order = await LoadAdminOrderAsync(id, cancellationToken);
        return Ok(order.ToAdminDetail(_delivery));
    }

    [HttpPut("{id:guid}/delivery-date")]
    [ProducesResponseType(typeof(AdminOrderDetailResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminOrderDetailResponse>> UpdateDeliveryDate(
        Guid id,
        [FromBody] UpdateDeliveryDateRequest request,
        CancellationToken cancellationToken)
    {
        var order = await LoadAdminOrderAsync(id, cancellationToken, tracking: true);
        if (!order.Items.Any(i => i.ItemType == OrderItemType.Product))
            throw ViviException.Conflict("NOT_A_PHYSICAL_ORDER", "Delivery dates apply to physical product orders only.");

        if (!order.DeliveryEstimateMinDays.HasValue && !order.EstimatedDeliveryDateFrom.HasValue)
            throw ViviException.Conflict("DELIVERY_MISSING", "This order has no system delivery estimate to override.");

        var from = request.DeliveryDateFrom.Date;
        var to = (request.DeliveryDateTo ?? request.DeliveryDateFrom).Date;
        if (to < from)
            throw ViviException.Conflict("INVALID_DATE_RANGE", "Delivery end date cannot be before the start date.");

        var previous = _delivery.GetEffectiveDates(order);
        if (previous.From.Date == from && previous.To.Date == to)
        {
            return Ok(order.ToAdminDetail(_delivery));
        }

        var now = DateTime.UtcNow;
        var adminId = User.GetUserId();
        var history = new OrderDeliveryUpdate
        {
            Id = Guid.NewGuid(),
            OrderId = order.Id,
            PreviousDateFrom = previous.From,
            PreviousDateTo = previous.To,
            NewDateFrom = from,
            NewDateTo = to,
            Reason = string.IsNullOrWhiteSpace(request.Reason) ? null : request.Reason.Trim(),
            ChangedBy = adminId,
            ChangedAt = now
        };
        _db.OrderDeliveryUpdates.Add(history);

        order.ManualDeliveryDateFrom = from;
        order.ManualDeliveryDateTo = to;
        order.DeliveryDateOverrideReason = string.IsNullOrWhiteSpace(request.Reason) ? null : request.Reason.Trim();
        order.DeliveryDateOverriddenAt = now;
        order.DeliveryDateOverriddenBy = adminId;
        order.UpdatedAt = now;

        await _db.SaveChangesAsync(cancellationToken);
        await _emails.NotifyDeliveryDateUpdatedAsync(order.Id, cancellationToken);

        order = await LoadAdminOrderAsync(id, cancellationToken);
        return Ok(order.ToAdminDetail(_delivery));
    }

    [HttpPut("{id:guid}/status")]
    [ProducesResponseType(typeof(AdminOrderDetailResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminOrderDetailResponse>> UpdateStatus(
        Guid id,
        [FromBody] UpdateOrderStatusRequest request,
        CancellationToken cancellationToken)
    {
        var order = await LoadAdminOrderAsync(id, cancellationToken, tracking: true);
        if (!order.Items.Any(i => i.ItemType == OrderItemType.Product))
            throw ViviException.Conflict("NOT_A_PHYSICAL_ORDER", "Production status applies to physical product orders only.");

        if (order.Status == request.Status)
            return Ok(order.ToAdminDetail(_delivery));

        if (!IsAllowedStatusTransition(order.Status, request.Status))
        {
            throw ViviException.Conflict(
                "INVALID_STATUS_TRANSITION",
                $"Cannot move order from {order.Status} to {request.Status}.");
        }

        order.Status = request.Status;
        order.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(cancellationToken);
        order = await LoadAdminOrderAsync(id, cancellationToken);
        return Ok(order.ToAdminDetail(_delivery));
    }

    /// <summary>
    /// Forward-only fulfillment flow for handmade/resell product orders.
    /// Shipped is the admin "Dispatched" step shown to customers.
    /// </summary>
    private static bool IsAllowedStatusTransition(OrderStatus from, OrderStatus to) =>
        (from, to) switch
        {
            (OrderStatus.Confirmed, OrderStatus.InProduction) => true,
            (OrderStatus.Confirmed, OrderStatus.Shipped) => true,
            (OrderStatus.InProduction, OrderStatus.Shipped) => true,
            (OrderStatus.InProduction, OrderStatus.Delivered) => true,
            (OrderStatus.Shipped, OrderStatus.Delivered) => true,
            _ => false
        };

    private async Task<Order> LoadAdminOrderAsync(Guid id, CancellationToken cancellationToken, bool tracking = false)
    {
        var query = tracking ? _db.Orders.AsQueryable() : _db.Orders.AsNoTracking();
        return await query
            .Include(o => o.Items)
            .Include(o => o.Payments)
            .Include(o => o.Customer)
            .Include(o => o.DeliveryDateOverriddenByUser)
            .Include(o => o.DeliveryUpdates)
            .ThenInclude(u => u.ChangedByUser)
            .SingleOrDefaultAsync(o => o.Id == id, cancellationToken)
            ?? throw ViviException.NotFound("ORDER_NOT_FOUND", "Order was not found.");
    }
}
