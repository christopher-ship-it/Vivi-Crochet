using VIVI.Core.Enums;

namespace VIVI.Core.Entities;

/// <summary>
/// The app's welcome video, uploaded from the admin dashboard. There is only ever one row.
/// The upload is compressed to a phone-friendly MP4; until that finishes (or if it fails) the previous
/// playable file, if any, keeps being served.
/// </summary>
public sealed class IntroVideo
{
    public Guid Id { get; set; }
    /// <summary>When false the app hides the play icon and the first-visit preview.</summary>
    public bool IsEnabled { get; set; } = true;
    /// <summary>The latest file the admin uploaded (kept so it can be compressed again).</summary>
    public string OriginalBlobPath { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public long FileSizeBytes { get; set; }
    public string ContentType { get; set; } = string.Empty;
    /// <summary>The compressed file the app plays. Empty until the first compression finishes.</summary>
    public string BlobPath { get; set; } = string.Empty;
    public long? PlayableFileSizeBytes { get; set; }
    public VideoTranscodeStatus TranscodeStatus { get; set; } = VideoTranscodeStatus.None;
    public string? TranscodeError { get; set; }
    public bool UploadConfirmed { get; set; }
    /// <summary>Goes up each time a new compressed file becomes the one the app plays.</summary>
    public int Version { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
