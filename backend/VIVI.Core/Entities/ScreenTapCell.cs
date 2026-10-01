namespace VIVI.Core.Entities;

/// <summary>
/// Aggregated tap count for one cell of a screen's heatmap grid
/// (<see cref="GridColumns"/> × <see cref="GridRows"/> cells over the screen).
/// </summary>
public sealed class ScreenTapCell
{
    public const int GridColumns = 10;
    public const int GridRows = 20;

    public Guid Id { get; set; }
    public string Screen { get; set; } = string.Empty;
    public int Col { get; set; }
    public int Row { get; set; }
    public long Taps { get; set; }
    public DateTime UpdatedAt { get; set; }
}
