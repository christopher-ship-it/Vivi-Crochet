namespace VIVI.Core.Entities;

/// <summary>How far one customer has watched one lesson video. One row per customer and video.</summary>
public sealed class VideoProgress
{
    /// <summary>Watched at least this fraction of the video counts as finished.</summary>
    public const double CompletedFraction = 0.95;

    public Guid Id { get; set; }
    public Guid CustomerId { get; set; }
    public Guid CourseId { get; set; }
    public Guid VideoId { get; set; }
    public int PositionSeconds { get; set; }
    public int DurationSeconds { get; set; }
    /// <summary>Once true it stays true, even if the customer later rewatches from the start.</summary>
    public bool IsCompleted { get; set; }
    public DateTime UpdatedAt { get; set; }
}
