using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using VIVI.Api.DTOs.Payments;
using VIVI.Api.Extensions;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Commerce;
using VIVI.Infrastructure.Configuration;
using Microsoft.Extensions.Options;

namespace VIVI.Api.Controllers;

[ApiController]
[Route("api/payments/razorpay")]
public sealed class PaymentsController : ControllerBase
{
    private readonly CustomerResolver _customers;
    private readonly PaymentFulfillmentService _fulfillment;
    private readonly IRazorpaySignatureVerifier _signatureVerifier;
    private readonly RazorpayOptions _razorpayOptions;

    public PaymentsController(
        CustomerResolver customers,
        PaymentFulfillmentService fulfillment,
        IRazorpaySignatureVerifier signatureVerifier,
        IOptions<RazorpayOptions> razorpayOptions)
    {
        _customers = customers;
        _fulfillment = fulfillment;
        _signatureVerifier = signatureVerifier;
        _razorpayOptions = razorpayOptions.Value;
    }

    /// <summary>Verifies a Razorpay payment signature and fulfills the order.</summary>
    [HttpPost("verify")]
    [Authorize(Roles = nameof(UserRole.Customer))]
    [ProducesResponseType(typeof(RazorpayVerifyResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<RazorpayVerifyResponse>> Verify(
        [FromBody] RazorpayVerifyRequest request,
        CancellationToken cancellationToken)
    {
        var customer = await _customers.ResolveForUserAsync(User.GetUserId(), cancellationToken);
        var result = await _fulfillment.VerifyAndFulfillAsync(
            customer.Id,
            new PaymentVerificationInput(
                request.InternalOrderId,
                request.RazorpayOrderId,
                request.RazorpayPaymentId,
                request.RazorpaySignature),
            cancellationToken);

        return Ok(new RazorpayVerifyResponse
        {
            OrderId = result.Order.Id,
            OrderNumber = result.Order.OrderNumber,
            Status = result.Order.Status.ToString(),
            AlreadyProcessed = result.AlreadyProcessed
        });
    }

    /// <summary>Processes Razorpay webhook events idempotently.</summary>
    [HttpPost("webhook")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> Webhook(CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_razorpayOptions.WebhookSecret))
            throw ViviException.Conflict("WEBHOOK_DISABLED", "Razorpay webhook secret is not configured.");

        using var reader = new StreamReader(Request.Body, Encoding.UTF8);
        var payload = await reader.ReadToEndAsync(cancellationToken);
        var signature = Request.Headers["X-Razorpay-Signature"].FirstOrDefault();

        if (string.IsNullOrWhiteSpace(signature) || !_signatureVerifier.VerifyWebhookSignature(payload, signature))
            throw ViviException.Unauthorized("INVALID_WEBHOOK", "Webhook signature verification failed.");

        using var doc = JsonDocument.Parse(payload);
        var root = doc.RootElement;
        var eventName = root.GetProperty("event").GetString() ?? string.Empty;
        if (!eventName.Equals("payment.captured", StringComparison.OrdinalIgnoreCase))
            return Ok(new { received = true, ignored = true });

        var paymentEntity = root.GetProperty("payload").GetProperty("payment").GetProperty("entity");
        var razorpayOrderId = paymentEntity.GetProperty("order_id").GetString()
            ?? throw ViviException.Conflict("INVALID_WEBHOOK", "Webhook payload missing order id.");
        var razorpayPaymentId = paymentEntity.GetProperty("id").GetString()
            ?? throw ViviException.Conflict("INVALID_WEBHOOK", "Webhook payload missing payment id.");

        await _fulfillment.ProcessWebhookPaymentAsync(razorpayOrderId, razorpayPaymentId, cancellationToken);
        return Ok(new { received = true });
    }
}
