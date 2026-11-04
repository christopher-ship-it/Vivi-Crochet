namespace VIVI.Api.DTOs.Push;

public sealed class AdminBroadcastPushRequest
{
    public string Title { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    /// <summary>Expo Router path, e.g. /(tabs)/shop</summary>
    public string Screen { get; set; } = "/(tabs)/shop";
    /// <summary>Optional picture shown with the notification (https link from the picture upload).</summary>
    public string? ImageUrl { get; set; }
    /// <summary>Send to this customer's devices only; null sends to every device.</summary>
    public Guid? CustomerId { get; set; }
}

public sealed class AdminPushImageResponse
{
    public string ImageUrl { get; set; } = string.Empty;
}

public sealed class AdminPushReachResponse
{
    public int ActiveDevices { get; set; }
    public int ActiveCustomers { get; set; }
}

public sealed class AdminBroadcastPushResponse
{
    public int SentToDevices { get; set; }
}
