using VIVI.Core.Enums;

namespace VIVI.Core.Entities;

public sealed class EmailNotification
{
    public Guid Id { get; set; }
    public string IdempotencyKey { get; set; } = string.Empty;
    public EmailNotificationType Type { get; set; }
    public string RecipientEmail { get; set; } = string.Empty;
    public string Subject { get; set; } = string.Empty;
    public string HtmlBody { get; set; } = string.Empty;
    public string? TextBody { get; set; }
    public EmailNotificationStatus Status { get; set; } = EmailNotificationStatus.Pending;
    public string? ProviderMessageId { get; set; }
    public int AttemptCount { get; set; }
    public string? LastError { get; set; }
    public Guid? OrderId { get; set; }
    public Guid? CourseEnrollmentId { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public DateTime? SentAt { get; set; }
}
