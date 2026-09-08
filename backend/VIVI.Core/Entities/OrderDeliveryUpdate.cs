namespace VIVI.Core.Entities;

public sealed class OrderDeliveryUpdate
{
    public Guid Id { get; set; }
    public Guid OrderId { get; set; }
    public DateTime PreviousDateFrom { get; set; }
    public DateTime PreviousDateTo { get; set; }
    public DateTime NewDateFrom { get; set; }
    public DateTime NewDateTo { get; set; }
    public string? Reason { get; set; }
    public Guid ChangedBy { get; set; }
    public DateTime ChangedAt { get; set; }

    public Order? Order { get; set; }
    public AdminUser? ChangedByUser { get; set; }
}
