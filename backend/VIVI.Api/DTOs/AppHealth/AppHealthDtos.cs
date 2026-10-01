namespace VIVI.Api.DTOs.AppHealth;

public sealed class ReportAppIssueRequest
{
    /// <summary><c>Crash</c> or <c>Bug</c>.</summary>
    public string Kind { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string? Details { get; set; }
    public string? Screen { get; set; }
    public string? AppVersion { get; set; }
    public string? Platform { get; set; }
    public string? DeviceInfo { get; set; }
    public bool IsFatal { get; set; }
}

public sealed class TapCellDto
{
    public int Col { get; set; }
    public int Row { get; set; }
    public long Taps { get; set; }
}

public sealed class ReportTapsRequest
{
    public string Screen { get; set; } = string.Empty;
    public List<TapCellDto> Cells { get; set; } = new();
}

public sealed class AdminAppIssueResponse
{
    public Guid Id { get; set; }
    public string Kind { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string? Details { get; set; }
    public string? Screen { get; set; }
    public string? AppVersion { get; set; }
    public string? Platform { get; set; }
    public string? DeviceInfo { get; set; }
    public bool IsFatal { get; set; }
    public string CustomerName { get; set; } = string.Empty;
    public string PhoneNumber { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public bool IsResolved { get; set; }
    public DateTime? ResolvedAt { get; set; }
}

public sealed class AppHealthSummaryResponse
{
    public int OpenCrashes { get; set; }
    public int OpenBugs { get; set; }
    public int CrashesLast7Days { get; set; }
    public int BugsLast7Days { get; set; }
    public int OpenBuffering { get; set; }
    public int BufferingLast7Days { get; set; }
    public long TotalTaps { get; set; }
}

public sealed class HeatmapScreenResponse
{
    public string Screen { get; set; } = string.Empty;
    public long Taps { get; set; }
}

public sealed class HeatmapResponse
{
    public string Screen { get; set; } = string.Empty;
    public int Columns { get; set; }
    public int Rows { get; set; }
    public long TotalTaps { get; set; }
    public long MaxCellTaps { get; set; }
    public List<TapCellDto> Cells { get; set; } = new();
}
