namespace VIVI.Api.DTOs.Admin;

public sealed class IntroVideoUploadUrlRequest
{
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long FileSizeBytes { get; set; }
}

public sealed class IntroVideoUploadUrlResponse
{
    public string UploadUrl { get; set; } = string.Empty;
    public DateTimeOffset ExpiresAt { get; set; }
    public string BlobPath { get; set; } = string.Empty;
    public long MaxFileSizeBytes { get; set; }
}

public sealed class IntroVideoUploadCompleteRequest
{
    public string BlobPath { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long FileSizeBytes { get; set; }
}

public sealed class IntroVideoSettingsRequest
{
    public bool IsEnabled { get; set; }
}

public sealed class AdminIntroVideoResponse
{
    /// <summary>True once a compressed video exists for the app to play.</summary>
    public bool HasVideo { get; set; }
    public bool IsEnabled { get; set; }
    public string? FileName { get; set; }
    public long? UploadedFileSizeBytes { get; set; }
    public long? PlayableFileSizeBytes { get; set; }
    /// <summary>None, Queued, Processing, Ready or Failed: the state of the newest upload.</summary>
    public string Status { get; set; } = "None";
    public string? Error { get; set; }
    public int Version { get; set; }
    public DateTime? UpdatedAt { get; set; }
    /// <summary>A temporary link to watch the video the app plays, for the admin preview.</summary>
    public string? PreviewUrl { get; set; }
}

public sealed class IntroVideoResponse
{
    public bool Available { get; set; }
    public string? Url { get; set; }
    /// <summary>Changes whenever the video is replaced.</summary>
    public int Version { get; set; }
}
