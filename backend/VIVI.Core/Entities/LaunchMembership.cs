namespace VIVI.Core.Entities;

/// <summary>
/// One row per successful ₹999 Launch Offer / Founding Membership purchase.
/// Created only after payment capture, alongside the CourseEnrollment rows it grants.
/// </summary>
public sealed class LaunchMembership
{
    public Guid Id { get; set; }
    public Guid CustomerId { get; set; }
    /// <summary>The bundle course this membership was purchased through (== LaunchOfferCounter.CourseId).</summary>
    public Guid CourseId { get; set; }
    public Guid OrderId { get; set; }
    public Guid OrderItemId { get; set; }
    /// <summary>Sequential founding-member number, allocated atomically from LaunchOfferCounter.CompletedPurchaseCount.</summary>
    public int MemberNumber { get; set; }
    /// <summary>Founding-member ID like <c>VV-KQTD-007</c>: random letters plus <see cref="MemberNumber"/>.</summary>
    public string? MemberCode { get; set; }
    /// <summary>Snapshot of the viral project granted at purchase time (the offer's configured project may change later).</summary>
    public Guid? ViralProjectCourseId { get; set; }
    public DateTime AccessStartDate { get; set; }
    public DateTime AccessExpiryDate { get; set; }
    public DateTime BadgeGrantedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public Customer? Customer { get; set; }
    public Course? Course { get; set; }
    public Order? Order { get; set; }
    public OrderItem? OrderItem { get; set; }
    public Course? ViralProjectCourse { get; set; }
}
