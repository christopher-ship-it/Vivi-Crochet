using VIVI.Core.Enums;

namespace VIVI.Core.Entities;

public sealed class Customer
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string FullName { get; set; } = string.Empty;
    /// <summary>10-digit Indian mobile for OTP accounts; E.164 digits for international email accounts.</summary>
    public string? PhoneNumber { get; set; }
    public string Email { get; set; } = string.Empty;
    /// <summary>When the communication email was verified via OTP. Null until verified.</summary>
    public DateTime? EmailVerifiedAt { get; set; }
    public int? Age { get; set; }
    /// <summary>Account country chosen at registration (not inferred).</summary>
    public string? Country { get; set; }
    public string? State { get; set; }
    public string? City { get; set; }
    public CustomerAuthMethod AuthMethod { get; set; } = CustomerAuthMethod.PhoneOtp;
    public bool IsActive { get; set; } = true;

    /// <summary>Last saved delivery address used to prefill checkout.</summary>
    public string? ShipFullName { get; set; }
    public string? ShipPhone { get; set; }
    public string? ShipAddressLine1 { get; set; }
    public string? ShipAddressLine2 { get; set; }
    public string? ShipLandmark { get; set; }
    /// <summary>Saved address label: Home, Work, or Other.</summary>
    public string? ShipAddressTag { get; set; }
    public string? ShipCity { get; set; }
    public string? ShipState { get; set; }
    public string? ShipPinCode { get; set; }
    public string? ShipCountry { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    /// <summary>When onboarding course + live push notifications were sent (null = not yet).</summary>
    public DateTime? OnboardingPushesSentAt { get; set; }
    /// <summary>When the last weekly product/course/live push batch was sent.</summary>
    public DateTime? LastWeeklyPushAt { get; set; }

    public AdminUser? User { get; set; }
    public ICollection<Order> Orders { get; set; } = new List<Order>();
    public ICollection<CourseEnrollment> Enrollments { get; set; } = new List<CourseEnrollment>();
    public ICollection<SupportInquiry> SupportInquiries { get; set; } = new List<SupportInquiry>();
    public ICollection<DevicePushToken> DevicePushTokens { get; set; } = new List<DevicePushToken>();
}
