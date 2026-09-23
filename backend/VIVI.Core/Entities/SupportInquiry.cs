namespace VIVI.Core.Entities;

/// <summary>One-shot support query from the mobile Contact us chat.</summary>
public sealed class SupportInquiry
{
    public Guid Id { get; set; }
    public Guid CustomerId { get; set; }
    public string Message { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    /// <summary>False until an admin opens/marks the inquiry in the console.</summary>
    public bool IsRead { get; set; }

    public Customer? Customer { get; set; }
}
