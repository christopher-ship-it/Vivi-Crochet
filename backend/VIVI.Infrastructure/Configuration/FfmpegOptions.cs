namespace VIVI.Infrastructure.Configuration;

public sealed class FfmpegOptions
{
    public const string SectionName = "FFmpeg";

    /// <summary>Full path to ffmpeg binary. Empty = auto-detect (PATH, tools/ffmpeg, common install dirs).</summary>
    public string ExecutablePath { get; set; } = string.Empty;

    /// <summary>Temp working directory for downloads / encodes. Empty = /home/transcode-tmp or local temp.</summary>
    public string TempDirectory { get; set; } = string.Empty;

    /// <summary>libx264 CRF (18–28). 24 favors speed/size on App Service B2 while staying watchable on phones.</summary>
    public int Crf { get; set; } = 24;

    /// <summary>Max output width. 720 is enough for in-app lesson playback and much faster than 1080/1280 on B2.</summary>
    public int MaxWidth { get; set; } = 720;

    /// <summary>Cap output frame rate (camera 50/60 fps encodes much slower without this).</summary>
    public int MaxFps { get; set; } = 24;

    public string AudioBitrate { get; set; } = "96k";

    /// <summary>libx264 preset. ultrafast is the right default on App Service B1/B2 for lesson compress.</summary>
    public string Preset { get; set; } = "ultrafast";
}
