namespace VIVI.Api.DTOs.Push;

public sealed class AdminBroadcastPushRequest
{
    public string Title { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    /// <summary>Expo Router path, e.g. /(tabs)/shop</summary>
    public string Screen { get; set; } = "/(tabs)/shop";
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
