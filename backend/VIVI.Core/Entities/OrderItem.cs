using VIVI.Core.Enums;

namespace VIVI.Core.Entities;

public sealed class OrderItem
{
    public Guid Id { get; set; }
    public Guid OrderId { get; set; }
    public OrderItemType ItemType { get; set; }
    public Guid? ProductId { get; set; }
    public Guid? CourseId { get; set; }
    public Guid? LiveWeekId { get; set; }
    public LiveSlotType? LiveSlotType { get; set; }
    public int Quantity { get; set; } = 1;
    public decimal UnitPrice { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal TotalAmount { get; set; }
    public string ItemNameSnapshot { get; set; } = string.Empty;

    public Order? Order { get; set; }
    public Product? Product { get; set; }
    public Course? Course { get; set; }
    public ICollection<CourseEnrollment> Enrollments { get; set; } = new List<CourseEnrollment>();
}
