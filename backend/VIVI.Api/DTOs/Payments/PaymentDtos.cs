namespace VIVI.Api.DTOs.Payments;

public sealed class RazorpayVerifyRequest
{
    public Guid InternalOrderId { get; set; }
    public string RazorpayOrderId { get; set; } = string.Empty;
    public string RazorpayPaymentId { get; set; } = string.Empty;
    public string RazorpaySignature { get; set; } = string.Empty;
}

public sealed class RazorpayVerifyResponse
{
    public Guid OrderId { get; set; }
    public string OrderNumber { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public bool AlreadyProcessed { get; set; }
}
