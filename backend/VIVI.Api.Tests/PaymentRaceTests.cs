using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using VIVI.Core.Enums;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Commerce;
using VIVI.Infrastructure.Data;
using VIVI.Infrastructure.Email;
using Xunit;

namespace VIVI.Api.Tests;

public sealed class PaymentRaceTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public PaymentRaceTests(ApiFactory factory) => _factory = factory;

    /// <summary>Holds the first Razorpay lookup until released, like a slow network call.</summary>
    private sealed class SlowFirstLookupGateway : IRazorpayPaymentGateway
    {
        private readonly IRazorpayPaymentGateway _inner = new FakeRazorpayPaymentGateway();
        private int _calls;
        public readonly TaskCompletionSource Entered = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public readonly TaskCompletionSource Release = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public Task<RazorpayOrderResult> CreateOrderAsync(string receipt, int amountPaise, string currency, CancellationToken ct)
            => _inner.CreateOrderAsync(receipt, amountPaise, currency, ct);

        public async Task<RazorpayPaymentDetails?> FetchPaymentAsync(string razorpayPaymentId, CancellationToken ct)
        {
            if (Interlocked.Increment(ref _calls) == 1)
            {
                Entered.SetResult();
                await Release.Task;
            }
            return await _inner.FetchPaymentAsync(razorpayPaymentId, ct);
        }

        public Task<RazorpayRefundResult> RefundPaymentAsync(string id, int amountPaise, string receipt, CancellationToken ct)
            => _inner.RefundPaymentAsync(id, amountPaise, receipt, ct);
    }

    private PaymentFulfillmentService NewService(IServiceScope scope, IRazorpayPaymentGateway gateway)
    {
        var sp = scope.ServiceProvider;
        var db = sp.GetRequiredService<ViviDbContext>();
        return new PaymentFulfillmentService(
            db,
            sp.GetRequiredService<IRazorpaySignatureVerifier>(),
            gateway,
            new TransactionalEmailService(
                db,
                new FakeEmailService(isConfigured: true),
                Microsoft.Extensions.Logging.Abstractions.NullLogger<TransactionalEmailService>.Instance),
            new LaunchOfferService(db),
            new PricingService(db),
            new DeliveryEstimateService(),
            new InventoryService(db),
            sp.GetRequiredService<LiveBookingService>(),
            new DeliverySequenceService(db, new DeliveryEstimateService()));
    }

    [Fact]
    public async Task Webhook_finishing_during_the_verify_lookup_is_not_fulfilled_twice()
    {
        var (customer, courseId) = await OrderTestsHelper.CustomerWithPublishedCourse(_factory, "9444444441");
        var order = await OrderTestsHelper.CreateCourseOrderAsync(customer, courseId);
        var paymentId = FakeRazorpayPaymentGateway.BuildTestPaymentId(order.RazorpayOrderId);
        var signature = FakeRazorpayPaymentGateway.BuildTestSignature(order.RazorpayOrderId, paymentId);

        using var verifyScope = _factory.Services.CreateScope();
        using var webhookScope = _factory.Services.CreateScope();
        var customerId = (await verifyScope.ServiceProvider.GetRequiredService<ViviDbContext>()
            .Customers.SingleAsync(c => c.PhoneNumber == "9444444441")).Id;

        var slow = new SlowFirstLookupGateway();
        var verify = NewService(verifyScope, slow).VerifyAndFulfillAsync(
            customerId,
            new PaymentVerificationInput(order.OrderId, order.RazorpayOrderId, paymentId, signature),
            CancellationToken.None);

        await slow.Entered.Task; // verify is now waiting on Razorpay

        var webhook = await NewService(webhookScope, new FakeRazorpayPaymentGateway())
            .ProcessWebhookPaymentAsync(order.RazorpayOrderId, paymentId, CancellationToken.None);
        Assert.False(webhook.AlreadyProcessed);

        slow.Release.SetResult();
        var verified = await verify;

        Assert.True(verified.AlreadyProcessed);
        await using var check = _factory.Services.CreateAsyncScope();
        var db = check.ServiceProvider.GetRequiredService<ViviDbContext>();
        Assert.Single(await db.CourseEnrollments.Where(e => e.OrderId == order.OrderId).ToListAsync());
    }
}
