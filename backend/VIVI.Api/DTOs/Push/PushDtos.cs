namespace VIVI.Api.DTOs.Push;

public sealed class RegisterPushTokenRequest
{
    public string ExpoPushToken { get; set; } = string.Empty;
    public string Platform { get; set; } = string.Empty;
}

public sealed class RemovePushTokenRequest
{
    public string? ExpoPushToken { get; set; }
}
