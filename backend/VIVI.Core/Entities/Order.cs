using VIVI.Core.Enums;

namespace VIVI.Core.Entities;

public sealed class Order
{
    public Guid Id { get; set; }
    public string OrderNumber { get; set; } = string.Empty;
    public Guid CustomerId { get; set; }
    public OrderStatus Status { get; set; } = OrderStatus.PendingPayment;
    public string Currency { get; set; } = "INR";
    public decimal Subtotal { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal ShippingAmount { get; set; }
    public decimal TotalAmount { get; set; }
    public string? RazorpayOrderId { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public DateTime? PaidAt { get; set; }
    public DateTime? ConfirmedAt { get; set; }
    /// <summary>True after product stock was deducted for this paid order (idempotent fulfillment).</summary>
    public bool InventoryDeducted { get; set; }

    public string? ShipFullName { get; set; }
    public string? ShipPhone { get; set; }
    public string? ShipAddressLine1 { get; set; }
    public string? ShipAddressLine2 { get; set; }
    public string? ShipLandmark { get; set; }
    public string? ShipCity { get; set; }
    public string? ShipState { get; set; }
    public string? ShipPinCode { get; set; }
    public string? ShipCountry { get; set; }
    public bool? IsCoimbatoreDelivery { get; set; }

    public int? DeliveryEstimateMinDays { get; set; }
    public int? DeliveryEstimateMaxDays { get; set; }
    public DateTime? EstimatedDeliveryDateFrom { get; set; }
    public DateTime? EstimatedDeliveryDateTo { get; set; }
    public DateTime? ManualDeliveryDateFrom { get; set; }
    public DateTime? ManualDeliveryDateTo { get; set; }
    public string? DeliveryDateOverrideReason { get; set; }
    public DateTime? DeliveryDateOverriddenAt { get; set; }
    public Guid? DeliveryDateOverriddenBy { get; set; }

    public Customer? Customer { get; set; }
    public AdminUser? DeliveryDateOverriddenByUser { get; set; }
    public ICollection<OrderItem> Items { get; set; } = new List<OrderItem>();
    public ICollection<Payment> Payments { get; set; } = new List<Payment>();
    public ICollection<OrderDeliveryUpdate> DeliveryUpdates { get; set; } = new List<OrderDeliveryUpdate>();
}
