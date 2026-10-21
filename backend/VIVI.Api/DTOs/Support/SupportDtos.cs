namespace VIVI.Api.DTOs.Support;

public sealed class CreateSupportInquiryRequest
{
    public string Message { get; set; } = string.Empty;
}

public sealed class SupportInquiryCreatedResponse
{
    public Guid Id { get; set; }
    public DateTime CreatedAt { get; set; }
}

public sealed class AdminSupportInquiryListItemResponse
{
    public Guid Id { get; set; }
    public Guid CustomerId { get; set; }
    public string CustomerName { get; set; } = string.Empty;
    public string PhoneNumber { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public bool IsRead { get; set; }
    public string? Reply { get; set; }
    public DateTime? RepliedAt { get; set; }
}

public sealed class SupportUnreadCountResponse
{
    public int Count { get; set; }
}

public sealed class ReplySupportInquiryRequest
{
    public string Reply { get; set; } = string.Empty;
}

public sealed class MySupportInquiryResponse
{
    public Guid Id { get; set; }
    public string Message { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public string? Reply { get; set; }
    public DateTime? RepliedAt { get; set; }
}
