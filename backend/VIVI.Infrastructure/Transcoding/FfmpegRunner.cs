using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using VIVI.Infrastructure.Configuration;

namespace VIVI.Infrastructure.Transcoding;

public sealed class FfmpegRunner
{
    private readonly FfmpegOptions _options;
    private readonly ILogger<FfmpegRunner> _logger;
    private string? _resolvedPath;

    public FfmpegRunner(IOptions<FfmpegOptions> options, ILogger<FfmpegRunner> logger)
    {
        _options = options.Value;
        _logger = logger;
    }

    public string? TryResolveExecutable()
    {
        if (!string.IsNullOrWhiteSpace(_resolvedPath) && File.Exists(_resolvedPath))
            return _resolvedPath;

        var candidates = new List<string>();
        if (!string.IsNullOrWhiteSpace(_options.ExecutablePath))
            candidates.Add(_options.ExecutablePath.Trim());

        var toolDir = Path.Combine(AppContext.BaseDirectory, "tools", "ffmpeg");
        candidates.Add(Path.Combine(toolDir, RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "ffmpeg.exe" : "ffmpeg"));
        candidates.Add(RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "ffmpeg.exe" : "ffmpeg");
        candidates.Add("/usr/bin/ffmpeg");
        candidates.Add("/usr/local/bin/ffmpeg");
        candidates.Add("/home/ffmpeg/ffmpeg");
        candidates.Add("/home/site/wwwroot/tools/ffmpeg/ffmpeg");

        foreach (var candidate in candidates)
        {
            if (LooksLikeAbsolutePath(candidate))
            {
                if (File.Exists(candidate))
                {
                    _resolvedPath = candidate;
                    return _resolvedPath;
                }
                continue;
            }

            // PATH lookup
            var fromPath = FindOnPath(candidate);
            if (fromPath is not null)
            {
                _resolvedPath = fromPath;
                return _resolvedPath;
            }
        }

        return null;
    }

    public async Task RunTranscodeAsync(
        string inputPath,
        string outputPath,
        CancellationToken cancellationToken)
    {
        var ffmpeg = TryResolveExecutable()
            ?? throw new InvalidOperationException(
                "ffmpeg was not found. Install ffmpeg on the host or set FFmpeg:ExecutablePath.");

        Directory.CreateDirectory(Path.GetDirectoryName(outputPath)!);
        if (File.Exists(outputPath))
            File.Delete(outputPath);

        var crf = Math.Clamp(_options.Crf, 18, 28);
        var maxWidth = Math.Clamp(_options.MaxWidth, 640, 3840);
        var maxFps = Math.Clamp(_options.MaxFps <= 0 ? 24 : _options.MaxFps, 15, 60);
        var preset = NormalizePreset(_options.Preset);
        var audioBitrate = string.IsNullOrWhiteSpace(_options.AudioBitrate) ? "96k" : _options.AudioBitrate.Trim();

        // Fast path for App Service B2: drop fps, downscale with fast bilinear, ultrafast x264.
        // Lesson playback is phone-sized — 720p / 24fps is enough and cuts encode time sharply.
        var args =
            $"-y -hide_banner -loglevel error " +
            $"-i \"{inputPath}\" " +
            $"-vf \"fps={maxFps},scale='min({maxWidth},iw)':-2:flags=fast_bilinear\" " +
            $"-c:v libx264 -preset {preset} -crf {crf} -threads 0 " +
            $"-x264-params \"ref=1:bframes=0:rc-lookahead=0:sync-lookahead=0:mbtree=0\" " +
            $"-pix_fmt yuv420p " +
            $"-c:a aac -b:a {audioBitrate} -ac 2 " +
            $"-movflags +faststart " +
            $"\"{outputPath}\"";

        _logger.LogInformation(
            "Running ffmpeg ({Preset}, crf={Crf}, maxWidth={MaxWidth}, maxFps={MaxFps}): {Ffmpeg}",
            preset,
            crf,
            maxWidth,
            maxFps,
            ffmpeg);

        var psi = new ProcessStartInfo
        {
            FileName = ffmpeg,
            Arguments = args,
            RedirectStandardError = true,
            RedirectStandardOutput = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };

        using var process = new Process { StartInfo = psi };
        var stderr = new StringBuilder();
        process.ErrorDataReceived += (_, e) =>
        {
            if (!string.IsNullOrEmpty(e.Data))
                stderr.AppendLine(e.Data);
        };
        process.OutputDataReceived += (_, _) => { };

        if (!process.Start())
            throw new InvalidOperationException("Failed to start ffmpeg process.");

        process.BeginErrorReadLine();
        process.BeginOutputReadLine();

        await process.WaitForExitAsync(cancellationToken);

        if (process.ExitCode != 0 || !File.Exists(outputPath) || new FileInfo(outputPath).Length == 0)
        {
            var tail = Truncate(stderr.ToString(), 800);
            throw new InvalidOperationException(
                $"ffmpeg failed (exit {process.ExitCode}). {tail}");
        }
    }

    private static string NormalizePreset(string? preset)
    {
        var value = (preset ?? string.Empty).Trim().ToLowerInvariant();
        return value switch
        {
            "ultrafast" or "superfast" or "veryfast" or "faster" or "fast" or "medium" => value,
            _ => "ultrafast",
        };
    }

    private static bool LooksLikeAbsolutePath(string path)
        => path.Contains('/') || path.Contains('\\') || Path.IsPathRooted(path);

    private static string? FindOnPath(string fileName)
    {
        var pathEnv = Environment.GetEnvironmentVariable("PATH") ?? "";
        foreach (var dir in pathEnv.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
        {
            try
            {
                var full = Path.Combine(dir.Trim(), fileName);
                if (File.Exists(full))
                    return full;
            }
            catch
            {
                // ignore bad PATH entries
            }
        }

        return null;
    }

    private static string Truncate(string value, int max)
        => value.Length <= max ? value : value[^max..];
}
