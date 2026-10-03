namespace VIVI.Api.DTOs.Videos;

public sealed class SaveVideoProgressRequest
{
    /// <summary>Where the learner is in the video, in seconds.</summary>
    public int PositionSeconds { get; set; }

    /// <summary>Total length of the video as the player reports it, in seconds.</summary>
    public int DurationSeconds { get; set; }
}

public sealed class VideoProgressResponse
{
    public Guid VideoId { get; set; }
    public Guid CourseId { get; set; }
    public int PositionSeconds { get; set; }
    public int DurationSeconds { get; set; }
    public bool IsCompleted { get; set; }

    /// <summary>0 to 100. Always 100 once the video has been completed.</summary>
    public int Percent { get; set; }

    public DateTime UpdatedAt { get; set; }
}
