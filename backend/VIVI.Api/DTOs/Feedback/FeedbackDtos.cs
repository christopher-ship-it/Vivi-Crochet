using System.ComponentModel.DataAnnotations;

namespace VIVI.Api.DTOs.Feedback;

public sealed class SubmitFeedbackRequest
{
    /// <summary>What the customer was looking for and could not find.</summary>
    [Required]
    [MinLength(2)]
    [MaxLength(1000)]
    public string Message { get; set; } = string.Empty;
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
    public int Last7Days { get; set; }
    public int Unresolved { get; set; }
}
