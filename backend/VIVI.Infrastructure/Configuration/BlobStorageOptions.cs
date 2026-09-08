using VIVI.Core;

namespace VIVI.Infrastructure.Configuration;

public sealed class BlobStorageOptions
{
    public const string SectionName = "Blob";

    /// <summary>Azure or InMemory.</summary>
    public string Provider { get; set; } = "Azure";
    public string ConnectionString { get; set; } = string.Empty;
    public string ContainerName { get; set; } = "videos";
    public int UploadSasMinutes { get; set; } = 30;
    public int ReadSasMinutes { get; set; } = 15;
    public long MaxUploadBytes { get; set; } = VideoFileRules.DefaultMaxBytes;

    /// <summary>
    /// When true (Development), upload-complete requires actual bytes on disk.
    /// Tests leave this false so they can complete without a PUT.
    /// </summary>
    public bool RequireDevBlobBytesOnComplete { get; set; }

    /// <summary>
    /// Public API base URL for InMemory dev blob URLs (e.g. http://192.168.1.4:5080).
    /// Must be reachable from phones on the same LAN.
    /// </summary>
    public string PublicBaseUrl { get; set; } = "http://localhost:5080";

    /// <summary>On-disk folder for dev blob bytes. Set at startup from ContentRootPath.</summary>
    public string DevBlobRoot { get; set; } = string.Empty;
}
