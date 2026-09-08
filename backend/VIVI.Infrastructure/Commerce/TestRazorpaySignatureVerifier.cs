using VIVI.Core.Interfaces;

namespace VIVI.Infrastructure.Commerce;

public sealed class TestRazorpaySignatureVerifier : IRazorpaySignatureVerifier
{
    public bool VerifyPaymentSignature(string razorpayOrderId, string razorpayPaymentId, string razorpaySignature)
        => razorpaySignature == FakeRazorpayPaymentGateway.BuildTestSignature(razorpayOrderId, razorpayPaymentId);

    public bool VerifyWebhookSignature(string payload, string signature) => signature == "test_webhook_sig";
}
