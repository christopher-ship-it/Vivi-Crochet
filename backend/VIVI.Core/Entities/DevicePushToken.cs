namespace VIVI.Core.Entities;

public sealed class DevicePushToken
{
    public Guid Id { get; set; }
    public Guid CustomerId { get; set; }
    /// <summary>Expo push token (ExponentPushToken[...]).</summary>
    public string ExpoPushToken { get; set; } = string.Empty;
    /// <summary>ios or android.</summary>
    public string Platform { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public Customer? Customer { get; set; }
}
