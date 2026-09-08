namespace VIVI.Core.Entities;

public sealed class CourseEnrollment
{
    public Guid Id { get; set; }
    public Guid CustomerId { get; set; }
    public Guid CourseId { get; set; }
    public Guid OrderId { get; set; }
    public Guid OrderItemId { get; set; }
    public DateTime PurchaseDate { get; set; }
    public DateTime AccessStartDate { get; set; }
    public DateTime AccessExpiryDate { get; set; }
    public DateTime? CompletedAt { get; set; }
    public bool CompletedFlag { get; set; }
    public bool ExpiryReminderSentFlag { get; set; }
    public bool RenewalOfferEligibleFlag { get; set; }
    public bool RenewalOfferUsedFlag { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public Customer? Customer { get; set; }
    public Course? Course { get; set; }
    public Order? Order { get; set; }
    public OrderItem? OrderItem { get; set; }
}
