using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VIVI.Api.DTOs.Orders;
using VIVI.Api.Extensions;
using VIVI.Api.Mapping;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Commerce;
using VIVI.Infrastructure.Data;

namespace VIVI.Api.Controllers;

[ApiController]
[Route("api/orders")]
[Authorize(Roles = nameof(UserRole.Customer))]
public sealed class OrdersController : ControllerBase
{
    private readonly ViviDbContext _db;
    private readonly CustomerResolver _customers;
    private readonly OrderCheckoutService _checkout;
    private readonly IDeliveryEstimateService _delivery;

    public OrdersController(
        ViviDbContext db,
        CustomerResolver customers,
        OrderCheckoutService checkout,
        IDeliveryEstimateService delivery)
    {
        _db = db;
        _customers = customers;
        _checkout = checkout;
        _delivery = delivery;
    }

    /// <summary>Returns a server-calculated delivery estimate without creating an order.</summary>
    [HttpPost("delivery-quote")]
    [ProducesResponseType(typeof(DeliveryQuoteResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<DeliveryQuoteResponse>> Quote(
        [FromBody] DeliveryQuoteRequest request,
        CancellationToken cancellationToken)
    {
        var lines = request.Items
            .Select(i => new CheckoutLineInput(i.ItemType, i.ProductId, i.CourseId, i.Quantity))
            .ToList();
        var quote = await _checkout.QuoteDeliveryAsync(lines, request.ShippingAddress.ToInput(), cancellationToken);
        return Ok(quote.ToDto());
    }

    /// <summary>Creates a pending order and Razorpay order from server-side prices.</summary>
    [HttpPost]
    [ProducesResponseType(typeof(CreateOrderResponse), StatusCodes.Status201Created)]
    public async Task<ActionResult<CreateOrderResponse>> Create(
        [FromBody] CreateOrderRequest request,
        CancellationToken cancellationToken)
    {
        var customer = await _customers.ResolveForUserAsync(User.GetUserId(), cancellationToken);
        var lines = request.Items
            .Select(i => new CheckoutLineInput(i.ItemType, i.ProductId, i.CourseId, i.Quantity))
            .ToList();
        var shipping = request.ShippingAddress is null ? null : request.ShippingAddress.ToInput();

        var result = await _checkout.CreateCheckoutAsync(
            customer.Id,
            lines,
            cancellationToken,
            request.PaymentMethod,
            shipping,
            request.SaveShippingAddress);
        return CreatedAtAction(nameof(Get), new { id = result.Order.Id }, result.Order.ToCheckoutResponse(result));
    }

    /// <summary>Returns the authenticated customer's orders.</summary>
    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<OrderResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<OrderResponse>>> List(CancellationToken cancellationToken)
    {
        var customer = await _customers.ResolveForUserAsync(User.GetUserId(), cancellationToken);
        var orders = await _db.Orders
            .AsNoTracking()
            .Include(o => o.Items)
            .Include(o => o.Payments)
            .Where(o => o.CustomerId == customer.Id)
            .OrderByDescending(o => o.CreatedAt)
            .ToListAsync(cancellationToken);

        return Ok(orders.Select(o => o.ToDto(_delivery)).ToList());
    }

    /// <summary>Returns one order owned by the authenticated customer.</summary>
    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(OrderResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<OrderResponse>> Get(Guid id, CancellationToken cancellationToken)
    {
        var customer = await _customers.ResolveForUserAsync(User.GetUserId(), cancellationToken);
        var order = await _db.Orders
            .AsNoTracking()
            .Include(o => o.Items)
            .Include(o => o.Payments)
            .SingleOrDefaultAsync(o => o.Id == id && o.CustomerId == customer.Id, cancellationToken)
            ?? throw ViviException.NotFound("ORDER_NOT_FOUND", "Order was not found.");

        return Ok(order.ToDto(_delivery));
    }
}
