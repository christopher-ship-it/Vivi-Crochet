using VIVI.Core.Enums;

namespace VIVI.Api.DTOs.Videos;

public sealed class UploadUrlRequest
{
    public Guid CourseId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long FileSizeBytes { get; set; }
}

public sealed class UploadUrlResponse
{
    public Guid VideoId { get; set; }
    public string UploadUrl { get; set; } = string.Empty;
    public DateTimeOffset ExpiresAt { get; set; }
    public string BlobPath { get; set; } = string.Empty;
    public long MaxFileSizeBytes { get; set; }
}

public sealed class UpdateVideoRequest
{
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int? DurationSeconds { get; set; }
    public bool IsFreePreview { get; set; }
    public int? SortOrder { get; set; }
}

public sealed class ReportVideoDurationRequest
{
    public int DurationSeconds { get; set; }
}

public sealed class VideoResponse
{
    public Guid Id { get; set; }
    public Guid CourseId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int? DurationSeconds { get; set; }
    public string VideoFileName { get; set; } = string.Empty;
    public long FileSizeBytes { get; set; }
    public string ContentType { get; set; } = string.Empty;
    public long? PlayableFileSizeBytes { get; set; }
    public string? PlayableContentType { get; set; }
    public VideoTranscodeStatus TranscodeStatus { get; set; }
    public string? TranscodeError { get; set; }
    public bool IsFreePreview { get; set; }
    public bool UploadConfirmed { get; set; }
    public VideoStatus Status { get; set; }
    public int SortOrder { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public sealed class StreamUrlResponse
{
    public Guid VideoId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string StreamUrl { get; set; } = string.Empty;
    public DateTimeOffset ExpiresAt { get; set; }
}
