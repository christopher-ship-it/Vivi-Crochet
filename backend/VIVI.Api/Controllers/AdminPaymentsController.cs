using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VIVI.Api.Auth;
using VIVI.Api.DTOs.Orders;
using VIVI.Api.Mapping;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Commerce;
using VIVI.Infrastructure.Data;

namespace VIVI.Api.Controllers;

[ApiController]
[Route("api/admin/payments")]
[Authorize(Roles = AuthRoles.Console)]
public sealed class AdminPaymentsController : ControllerBase
{
    private readonly ViviDbContext _db;
    private readonly IRazorpayPaymentGateway _razorpay;
    private readonly PaymentFulfillmentService _fulfillment;

    public AdminPaymentsController(
        ViviDbContext db,
        IRazorpayPaymentGateway razorpay,
        PaymentFulfillmentService fulfillment)
    {
        _db = db;
        _razorpay = razorpay;
        _fulfillment = fulfillment;
    }

    /// <summary>
    /// Every payment attempt with the order it belongs to, tagged Product / Course / Live,
    /// plus per-source, per-currency totals over all rows.
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(AdminPaymentsResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminPaymentsResponse>> List(CancellationToken cancellationToken)
    {
        var payments = await _db.Payments
            .AsNoTracking()
            .Include(p => p.Order).ThenInclude(o => o!.Items)
            .Include(p => p.Order).ThenInclude(o => o!.Customer)
            .Where(p => p.Order != null)
            .OrderByDescending(p => p.CreatedAt)
            .ToListAsync(cancellationToken);

        var rows = payments.Select(p =>
        {
            var order = p.Order!;
            var source = order.Items.Any(i => i.ItemType == OrderItemType.Product) ? "Product"
                : order.Items.Any(i => i.ItemType == OrderItemType.LivePackage) ? "Live"
                : "Course";
            return new AdminPaymentListItemResponse
            {
                Id = p.Id,
                OrderId = order.Id,
                OrderNumber = order.OrderNumber,
                Source = source,
                TitleSummary = CommerceMapper.BuildTitleSummary(order.Items),
                CustomerName = CommerceMapper.DisplayCustomerName(order.Customer, order.ShipFullName),
                CustomerEmail = order.Customer?.Email ?? string.Empty,
                CustomerPhone = order.Customer?.PhoneNumber ?? order.ShipPhone ?? string.Empty,
                Amount = p.Amount,
                Currency = p.Currency,
                Status = p.Status,
                Provider = p.Provider,
                ProviderOrderId = p.ProviderOrderId,
                ProviderPaymentId = p.ProviderPaymentId,
                SignatureVerified = p.SignatureVerified,
                CreatedAt = p.CreatedAt,
                CompletedAt = p.CompletedAt
            };
        }).ToList();

        var totals = rows
            .GroupBy(r => (r.Source, r.Currency))
            .Select(g => new AdminPaymentSourceTotals
            {
                Source = g.Key.Source,
                Currency = g.Key.Currency,
                Collected = g.Where(r => r.Status == PaymentStatus.Captured).Sum(r => r.Amount),
                CapturedCount = g.Count(r => r.Status == PaymentStatus.Captured),
                PendingCount = g.Count(r => r.Status is PaymentStatus.Created or PaymentStatus.Authorized),
                FailedCount = g.Count(r => r.Status == PaymentStatus.Failed),
                Refunded = g.Where(r => r.Status == PaymentStatus.Refunded).Sum(r => r.Amount)
            })
            .ToList();

        return Ok(new AdminPaymentsResponse { Payments = rows, Totals = totals });
    }

    /// <summary>
    /// Recovers a payment Razorpay captured but our server never recorded (missed verify call or
    /// webhook). Checks the Razorpay payment really belongs to this payment's order and amount,
    /// then runs the normal idempotent fulfillment (confirms the order, unlocks courses, emails).
    /// </summary>
    [HttpPost("{id:guid}/sync")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Sync(
        Guid id,
        [FromBody] SyncPaymentRequest request,
        CancellationToken cancellationToken)
    {
        var razorpayPaymentId = request.RazorpayPaymentId?.Trim();
        if (string.IsNullOrEmpty(razorpayPaymentId) || !razorpayPaymentId.StartsWith("pay_", StringComparison.Ordinal))
            throw new ViviException("INVALID_PAYMENT_ID", "Enter the Razorpay payment ID (starts with pay_).");

        var payment = await _db.Payments
            .Include(p => p.Order)
            .SingleOrDefaultAsync(p => p.Id == id, cancellationToken)
            ?? throw ViviException.NotFound("PAYMENT_NOT_FOUND", "Payment record was not found.");

        var remote = await _razorpay.FetchPaymentAsync(razorpayPaymentId, cancellationToken)
            ?? throw ViviException.Conflict("PAYMENT_NOT_FOUND", "Razorpay could not find that payment.");

        if (!string.Equals(remote.RazorpayOrderId, payment.ProviderOrderId, StringComparison.Ordinal))
            throw ViviException.Conflict("PAYMENT_ORDER_MISMATCH", "That Razorpay payment belongs to a different order.");

        var expectedPaise = (int)Math.Round(payment.Order!.TotalAmount * 100m, MidpointRounding.AwayFromZero);
        if (remote.AmountPaise != expectedPaise)
            throw ViviException.Conflict("AMOUNT_MISMATCH", "Paid amount does not match the order total.");

        await _fulfillment.ProcessWebhookPaymentAsync(payment.ProviderOrderId, razorpayPaymentId, cancellationToken);
        return NoContent();
    }
}

public sealed class SyncPaymentRequest
{
    public string? RazorpayPaymentId { get; set; }
}
