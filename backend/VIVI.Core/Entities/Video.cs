using VIVI.Core.Enums;

namespace VIVI.Core.Entities;

public sealed class Video
{
    public Guid Id { get; set; }
    public Guid CourseId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int? DurationSeconds { get; set; }
    /// <summary>Playable blob path used for streaming (H.264 MP4 once transcode is Ready).</summary>
    public string BlobPath { get; set; } = string.Empty;
    /// <summary>Original upload blob path (camera MOV/MP4/WebM). Kept for remaster / re-compress.</summary>
    public string OriginalBlobPath { get; set; } = string.Empty;
    public string? ThumbnailBlobPath { get; set; }
    public string VideoFileName { get; set; } = string.Empty;
    public long FileSizeBytes { get; set; }
    public string ContentType { get; set; } = string.Empty;
    public long? PlayableFileSizeBytes { get; set; }
    public string? PlayableContentType { get; set; }
    public VideoTranscodeStatus TranscodeStatus { get; set; } = VideoTranscodeStatus.None;
    public string? TranscodeError { get; set; }
    public bool IsFreePreview { get; set; }
    public string? PatternPdfBlobPath { get; set; }
    public VideoStatus Status { get; set; } = VideoStatus.Draft;
    public int SortOrder { get; set; }
    public bool UploadConfirmed { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public Guid CreatedBy { get; set; }

    public Course? Course { get; set; }
    public AdminUser? CreatedByUser { get; set; }
}
