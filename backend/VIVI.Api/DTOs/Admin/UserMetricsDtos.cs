namespace VIVI.Api.DTOs.Admin;

public sealed class UserMetricsResponse
{
    public int TotalUsers { get; set; }
    /// <summary>Customers with a founding-membership (offer class) whose access has not expired.</summary>
    public int OfferClassUsers { get; set; }
    /// <summary>Customers with unexpired access to a course bought outside the offer class.</summary>
    public int OtherCourseUsers { get; set; }
    /// <summary>Customers with a confirmed Live booking for the current or a future week.</summary>
    public int LiveClassUsers { get; set; }
    /// <summary>Sign-ups over the days shown, as a percentage of the users at the start of that window.</summary>
    public decimal? GrowthPercent { get; set; }
    public IReadOnlyList<UserMetricsDay> Daily { get; set; } = [];
}

/// <summary>One calendar day (India time), newest first in the response.</summary>
public sealed class UserMetricsDay
{
    public string Date { get; set; } = string.Empty;
    public int NewUsers { get; set; }
    /// <summary>Different customers who watched a lesson, placed an order or booked a Live class that day.</summary>
    public int ActiveUsers { get; set; }
    public int TotalUsers { get; set; }
}

public sealed class UserMetricsUser
{
    public string Name { get; set; } = string.Empty;
    /// <summary>Real email only; empty for phone-OTP accounts that only have a generated placeholder.</summary>
    public string Email { get; set; } = string.Empty;
    public string Phone { get; set; } = string.Empty;
}
