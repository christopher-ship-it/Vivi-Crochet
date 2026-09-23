using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using VIVI.Core;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Configuration;
using VIVI.Infrastructure.Data;

namespace VIVI.Infrastructure.Transcoding;

public sealed class VideoTranscodeService
{
    private readonly ViviDbContext _db;
    private readonly IBlobStorageService _blob;
    private readonly FfmpegRunner _ffmpeg;
    private readonly FfmpegOptions _options;
    private readonly ILogger<VideoTranscodeService> _logger;

    public VideoTranscodeService(
        ViviDbContext db,
        IBlobStorageService blob,
        FfmpegRunner ffmpeg,
        IOptions<FfmpegOptions> options,
        ILogger<VideoTranscodeService> logger)
    {
        _db = db;
        _blob = blob;
        _ffmpeg = ffmpeg;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<int> QueueNeedingTranscodeAsync(CancellationToken cancellationToken)
    {
        var videos = await _db.Videos
            .Where(v => v.UploadConfirmed
                        && (v.TranscodeStatus == VideoTranscodeStatus.None
                            || v.TranscodeStatus == VideoTranscodeStatus.Failed
                            || (v.TranscodeStatus == VideoTranscodeStatus.Ready
                                && v.BlobPath == v.OriginalBlobPath)))
            .ToListAsync(cancellationToken);

        foreach (var video in videos)
            QueueVideo(video);

        if (videos.Count > 0)
            await _db.SaveChangesAsync(cancellationToken);

        return videos.Count;
    }

    public void QueueVideo(Video video)
    {
        if (string.IsNullOrWhiteSpace(video.OriginalBlobPath))
            video.OriginalBlobPath = video.BlobPath;

        video.TranscodeStatus = VideoTranscodeStatus.Queued;
        video.TranscodeError = null;
        video.UpdatedAt = DateTime.UtcNow;
    }

    /// <summary>
    /// App Service recycles kill in-flight ffmpeg. Jobs left in Processing would never
    /// be picked again (worker only claims Queued) — put them back on the queue.
    /// </summary>
    public async Task<int> ReclaimInterruptedAsync(CancellationToken cancellationToken)
    {
        var interrupted = await _db.Videos
            .Where(v => v.TranscodeStatus == VideoTranscodeStatus.Processing && v.UploadConfirmed)
            .ToListAsync(cancellationToken);

        foreach (var video in interrupted)
        {
            video.TranscodeStatus = VideoTranscodeStatus.Queued;
            video.TranscodeError = null;
            video.UpdatedAt = DateTime.UtcNow;
        }

        if (interrupted.Count > 0)
        {
            await _db.SaveChangesAsync(cancellationToken);
            _logger.LogWarning(
                "Re-queued {Count} interrupted video transcode(s) after worker start/recycle.",
                interrupted.Count);
        }

        return interrupted.Count;
    }

    /// <summary>Processes at most one Queued video. Returns true if work was done.</summary>
    public async Task<bool> ProcessNextAsync(CancellationToken cancellationToken)
    {
        var video = await _db.Videos
            .Where(v => v.TranscodeStatus == VideoTranscodeStatus.Queued && v.UploadConfirmed)
            .OrderBy(v => v.UpdatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (video is null)
            return false;

        // Testing: mark Ready without ffmpeg (no real media bytes).
        if (IsTestingEnvironment())
        {
            video.TranscodeStatus = VideoTranscodeStatus.Ready;
            video.TranscodeError = null;
            video.PlayableContentType = "video/mp4";
            video.PlayableFileSizeBytes = video.FileSizeBytes;
            video.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(cancellationToken);
            return true;
        }

        video.TranscodeStatus = VideoTranscodeStatus.Processing;
        video.TranscodeError = null;
        video.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        var workRoot = ResolveTempRoot();
        var jobDir = Path.Combine(workRoot, video.Id.ToString("N"));
        Directory.CreateDirectory(jobDir);

        var originalName = Path.GetFileName(video.OriginalBlobPath);
        if (string.IsNullOrWhiteSpace(originalName))
            originalName = "source.bin";

        var inputPath = Path.Combine(jobDir, originalName);
        var outputPath = Path.Combine(jobDir, "lesson.mp4");
        var playablePath = VideoFileRules.BuildPlayableBlobPath(video.CourseId, video.Id);

        try
        {
            if (_ffmpeg.TryResolveExecutable() is null)
                throw new InvalidOperationException(
                    "ffmpeg was not found. Install ffmpeg or set FFmpeg:ExecutablePath.");

            _logger.LogInformation("Transcoding video {VideoId} from {Original}", video.Id, video.OriginalBlobPath);
            await _blob.DownloadToFileAsync(video.OriginalBlobPath, inputPath, cancellationToken);

            if (!File.Exists(inputPath) || new FileInfo(inputPath).Length == 0)
                throw new InvalidOperationException("Original blob downloaded empty or missing.");

            await _ffmpeg.RunTranscodeAsync(inputPath, outputPath, cancellationToken);

            await _blob.UploadFromFileAsync(playablePath, outputPath, "video/mp4", cancellationToken);
            var playableInfo = new FileInfo(outputPath);

            video.BlobPath = playablePath;
            video.PlayableContentType = "video/mp4";
            video.PlayableFileSizeBytes = playableInfo.Length;
            video.ContentType = "video/mp4";
            video.TranscodeStatus = VideoTranscodeStatus.Ready;
            video.TranscodeError = null;
            video.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(cancellationToken);

            _logger.LogInformation(
                "Transcode ready for {VideoId}: {Bytes} bytes playable",
                video.Id,
                playableInfo.Length);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Transcode failed for video {VideoId}", video.Id);
            video.TranscodeStatus = VideoTranscodeStatus.Failed;
            video.TranscodeError = Truncate(ex.Message, 1000);
            video.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(cancellationToken);
            return true;
        }
        finally
        {
            try
            {
                if (Directory.Exists(jobDir))
                    Directory.Delete(jobDir, recursive: true);
            }
            catch (Exception cleanupEx)
            {
                _logger.LogWarning(cleanupEx, "Failed to clean transcode temp dir {Dir}", jobDir);
            }
        }
    }

    private static bool IsTestingEnvironment()
        => string.Equals(
            Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT"),
            "Testing",
            StringComparison.OrdinalIgnoreCase);

    private string ResolveTempRoot()
    {
        if (!string.IsNullOrWhiteSpace(_options.TempDirectory))
        {
            Directory.CreateDirectory(_options.TempDirectory);
            return _options.TempDirectory;
        }

        var home = Environment.GetEnvironmentVariable("HOME");
        if (!string.IsNullOrWhiteSpace(home))
        {
            var azureTmp = Path.Combine(home, "transcode-tmp");
            Directory.CreateDirectory(azureTmp);
            return azureTmp;
        }

        var local = Path.Combine(Path.GetTempPath(), "vivi-transcode");
        Directory.CreateDirectory(local);
        return local;
    }

    private static string Truncate(string value, int max)
        => value.Length <= max ? value : value[..max];
}
