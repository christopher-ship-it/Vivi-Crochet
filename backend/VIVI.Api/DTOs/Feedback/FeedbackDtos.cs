using System.ComponentModel.DataAnnotations;

namespace VIVI.Api.DTOs.Feedback;

public sealed class SubmitFeedbackRequest
{
    [Range(1, 5)]
    public int Rating { get; set; }
    [MaxLength(1000)]
    public string? Message { get; set; }
    [MaxLength(200)]
    public string? Screen { get; set; }
    [MaxLength(40)]
    public string? AppVersion { get; set; }
    [MaxLength(40)]
    public string? Platform { get; set; }
    [Range(0, 86400)]
    public int SecondsInApp { get; set; }
}

public sealed class AdminFeedbackItemResponse
{
    public Guid Id { get; set; }
    public int Rating { get; set; }
    public string? Message { get; set; }
    public string? Screen { get; set; }
    public string? AppVersion { get; set; }
    public string? Platform { get; set; }
    public int SecondsInApp { get; set; }
    public DateTime CreatedAt { get; set; }
    public bool IsResolved { get; set; }
    public DateTime? ResolvedAt { get; set; }
}

public sealed class AdminFeedbackSummaryResponse
{
    public int Total { get; set; }
    public double AverageRating { get; set; }
    public int Last7Days { get; set; }
    public int Unresolved { get; set; }
    /// <summary>Count of answers for each star value, index 0 = 1 star.</summary>
    public int[] RatingCounts { get; set; } = new int[5];
}
