using VIVI.Core.Enums;

namespace VIVI.Api.DTOs.Orders;

public sealed class CreateOrderItemRequest
{
    public OrderItemType ItemType { get; set; }
    public Guid? ProductId { get; set; }
    public Guid? CourseId { get; set; }
    public int Quantity { get; set; } = 1;
}

public sealed class ShippingAddressRequest
{
    public string FullName { get; set; } = string.Empty;
    public string PhoneNumber { get; set; } = string.Empty;
    public string AddressLine1 { get; set; } = string.Empty;
    public string? AddressLine2 { get; set; }
    public string? Landmark { get; set; }
    public string City { get; set; } = string.Empty;
    public string State { get; set; } = string.Empty;
    public string PinCode { get; set; } = string.Empty;
    public string? Country { get; set; }
}

public sealed class CreateOrderRequest
{
    public IReadOnlyList<CreateOrderItemRequest> Items { get; set; } = Array.Empty<CreateOrderItemRequest>();
    public string? PaymentMethod { get; set; }
    public ShippingAddressRequest? ShippingAddress { get; set; }
    /// <summary>When true (default), persists the shipping address on the customer profile.</summary>
    public bool SaveShippingAddress { get; set; } = true;
    public DateTime? EstimatedDeliveryDateFrom { get; set; }
    public DateTime? EstimatedDeliveryDateTo { get; set; }
    public int? DeliveryEstimateMinDays { get; set; }
    public int? DeliveryEstimateMaxDays { get; set; }
}

public sealed class DeliveryQuoteRequest
{
    public IReadOnlyList<CreateOrderItemRequest> Items { get; set; } = Array.Empty<CreateOrderItemRequest>();
    public ShippingAddressRequest ShippingAddress { get; set; } = new();
}

public sealed class DeliveryQuoteResponse
{
    public bool IsCoimbatore { get; set; }
    public string LocationLabel { get; set; } = string.Empty;
    public int MinDays { get; set; }
    public int MaxDays { get; set; }
    public string Summary { get; set; } = string.Empty;
    public DateTime EstimatedDeliveryDateFrom { get; set; }
    public DateTime EstimatedDeliveryDateTo { get; set; }
    public string PaymentMethod { get; set; } = "Online Payment";
}

public sealed class CreateOrderResponse
{
    public Guid OrderId { get; set; }
    public string OrderNumber { get; set; } = string.Empty;
    public string RazorpayOrderId { get; set; } = string.Empty;
    public string RazorpayKeyId { get; set; } = string.Empty;
    public int AmountPaise { get; set; }
    public string Currency { get; set; } = "INR";
    public decimal TotalAmount { get; set; }
    public string PaymentMethod { get; set; } = "Online Payment";
    public DeliveryQuoteResponse? Delivery { get; set; }
}

public sealed class OrderItemResponse
{
    public Guid Id { get; set; }
    public OrderItemType ItemType { get; set; }
    public Guid? ProductId { get; set; }
    public Guid? CourseId { get; set; }
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal TotalAmount { get; set; }
    public string ItemNameSnapshot { get; set; } = string.Empty;
}

public sealed class ShippingAddressResponse
{
    public string FullName { get; set; } = string.Empty;
    public string PhoneNumber { get; set; } = string.Empty;
    public string AddressLine1 { get; set; } = string.Empty;
    public string? AddressLine2 { get; set; }
    public string? Landmark { get; set; }
    public string City { get; set; } = string.Empty;
    public string State { get; set; } = string.Empty;
    public string PinCode { get; set; } = string.Empty;
    public string Country { get; set; } = "India";
}

public sealed class OrderDeliveryResponse
{
    public bool IsCoimbatore { get; set; }
    public string LocationLabel { get; set; } = string.Empty;
    public int MinDays { get; set; }
    public int MaxDays { get; set; }
    public string EstimateSummary { get; set; } = string.Empty;
    public DateTime SystemFrom { get; set; }
    public DateTime SystemTo { get; set; }
    public DateTime ExpectedFrom { get; set; }
    public DateTime ExpectedTo { get; set; }
    public bool IsOverridden { get; set; }
    public string CustomerLabel { get; set; } = string.Empty;
}

public class OrderResponse
{
    public Guid Id { get; set; }
    public string OrderNumber { get; set; } = string.Empty;
    public OrderStatus Status { get; set; }
    public string Currency { get; set; } = "INR";
    public decimal Subtotal { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal ShippingAmount { get; set; }
    public decimal TotalAmount { get; set; }
    public string PaymentMethod { get; set; } = "Online Payment";
    public PaymentStatus? PaymentStatus { get; set; }
    public string? RazorpayOrderId { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? PaidAt { get; set; }
    public DateTime? ConfirmedAt { get; set; }
    public IReadOnlyList<OrderItemResponse> Items { get; set; } = Array.Empty<OrderItemResponse>();
    public ShippingAddressResponse? ShippingAddress { get; set; }
    public OrderDeliveryResponse? Delivery { get; set; }
}

public sealed class AdminOrderListItemResponse
{
    public Guid Id { get; set; }
    public string OrderNumber { get; set; } = string.Empty;
    public OrderStatus Status { get; set; }
    public PaymentStatus? PaymentStatus { get; set; }
    public decimal TotalAmount { get; set; }
    public string CustomerName { get; set; } = string.Empty;
    public string CustomerEmail { get; set; } = string.Empty;
    public string CustomerPhone { get; set; } = string.Empty;
    /// <summary>Display title from order item name snapshots (e.g. first item + "N more").</summary>
    public string TitleSummary { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public bool HasPhysicalItems { get; set; }
    public bool HasCourseItems { get; set; }
    public bool HasLiveItems { get; set; }
    public bool DeliveryDateOverridden { get; set; }
    public string? DeliveryLabel { get; set; }
}

public sealed class OrderDeliveryHistoryResponse
{
    public Guid Id { get; set; }
    public DateTime PreviousFrom { get; set; }
    public DateTime PreviousTo { get; set; }
    public DateTime NewFrom { get; set; }
    public DateTime NewTo { get; set; }
    public string? Reason { get; set; }
    public Guid ChangedBy { get; set; }
    public string ChangedByName { get; set; } = string.Empty;
    public DateTime ChangedAt { get; set; }
}

public sealed class AdminOrderDetailResponse : OrderResponse
{
    public string CustomerName { get; set; } = string.Empty;
    public string CustomerPhone { get; set; } = string.Empty;
    public string CustomerEmail { get; set; } = string.Empty;
    public string? OverrideReason { get; set; }
    public DateTime? OverriddenAt { get; set; }
    public string? OverriddenByName { get; set; }
    public IReadOnlyList<OrderDeliveryHistoryResponse> DeliveryHistory { get; set; } = Array.Empty<OrderDeliveryHistoryResponse>();
}

public sealed class UpdateDeliveryDateRequest
{
    public DateTime DeliveryDateFrom { get; set; }
    public DateTime? DeliveryDateTo { get; set; }
    public string? Reason { get; set; }
}

public sealed class UpdateOrderStatusRequest
{
    public OrderStatus Status { get; set; }
    public string? Note { get; set; }
}
