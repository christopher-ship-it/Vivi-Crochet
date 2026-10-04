namespace VIVI.Api.DTOs.Admin;

public sealed class OtpStatsResponse
{
    /// <summary>Phone OTPs generated since the first one ever requested (every sign-in code the app asked for).</summary>
    public int TotalAllTime { get; set; }
    public int VerifiedAllTime { get; set; }
    /// <summary>Date of the earliest recorded OTP, or null if none.</summary>
    public DateTime? FirstRequestedAt { get; set; }
    public int Today { get; set; }
    public int Last7Days { get; set; }
    public int Last30Days { get; set; }
    public int VerifiedToday { get; set; }
    public int VerifiedLast7Days { get; set; }
    public int VerifiedLast30Days { get; set; }
    /// <summary>Different phone numbers that asked for a code in the last 30 days.</summary>
    public int UniquePhonesLast30Days { get; set; }
    public IReadOnlyList<OtpDayCount> Daily { get; set; } = [];
    public IReadOnlyList<OtpPhoneCount> TopPhonesLast7Days { get; set; } = [];
    public IReadOnlyList<OtpRecentRequest> Recent { get; set; } = [];
}

/// <summary>One calendar day (India time).</summary>
public sealed class OtpDayCount
{
    public string Date { get; set; } = string.Empty;
    public int Requested { get; set; }
    public int Verified { get; set; }
}

public sealed class OtpPhoneCount
{
    /// <summary>Phone with all but the last four digits hidden.</summary>
    public string Phone { get; set; } = string.Empty;
    public int Requests { get; set; }
    public int Verified { get; set; }
}

public sealed class OtpRecentRequest
{
    public DateTime RequestedAt { get; set; }
    public string Phone { get; set; } = string.Empty;
    /// <summary>Verified, Pending (still valid) or Expired (never used).</summary>
    public string Status { get; set; } = string.Empty;
    public int Attempts { get; set; }
}

/// <summary>Everything the Excel download needs: every day, every month and every request since the first OTP.</summary>
public sealed class OtpHistoryResponse
{
    /// <summary>Each India calendar day from the first OTP to today, including days with none.</summary>
    public IReadOnlyList<OtpDayHistory> Daily { get; set; } = [];
    /// <summary>Each month from the first OTP to this month.</summary>
    public IReadOnlyList<OtpMonthHistory> Monthly { get; set; } = [];
    /// <summary>Every request, newest first, with the phone masked.</summary>
    public IReadOnlyList<OtpRecentRequest> Requests { get; set; } = [];
}

public sealed class OtpDayHistory
{
    /// <summary>yyyy-MM-dd, India calendar day.</summary>
    public string Date { get; set; } = string.Empty;
    public int Requested { get; set; }
    public int Verified { get; set; }
    public int UniquePhones { get; set; }
}

public sealed class OtpMonthHistory
{
    /// <summary>yyyy-MM.</summary>
    public string Month { get; set; } = string.Empty;
    public int Requested { get; set; }
    public int Verified { get; set; }
    public int UniquePhones { get; set; }
    /// <summary>Days in the month (up to today) on which at least one OTP was requested.</summary>
    public int ActiveDays { get; set; }
}
