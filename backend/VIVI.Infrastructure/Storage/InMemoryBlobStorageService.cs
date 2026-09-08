using System.Collections.Concurrent;
using Microsoft.Extensions.Options;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Configuration;

namespace VIVI.Infrastructure.Storage;

/// <summary>
/// Local/test stand-in. In Development, bytes are stored on disk under App_Data/dev-blobs
/// and served via <c>/api/dev/blobs/{path}</c> so phones on the LAN can stream without Azure.
/// </summary>
public sealed class InMemoryBlobStorageService : IBlobStorageService
{
    private readonly ConcurrentDictionary<string, MemoryBlob> _blobs = new(StringComparer.OrdinalIgnoreCase);
    private readonly BlobStorageOptions _options;
    private readonly string _blobRoot;

    public InMemoryBlobStorageService(IOptions<BlobStorageOptions> options)
    {
        _options = options.Value;
        _blobRoot = string.IsNullOrWhiteSpace(_options.DevBlobRoot)
            ? Path.Combine(Directory.GetCurrentDirectory(), "App_Data", "dev-blobs")
            : _options.DevBlobRoot;
        Directory.CreateDirectory(_blobRoot);
    }

    public Task<BlobUploadTicket> CreateUploadSasAsync(
        string blobPath,
        string contentType,
        CancellationToken cancellationToken = default)
    {
        _blobs.AddOrUpdate(
            blobPath,
            _ => new MemoryBlob(false, 0, contentType),
            (_, existing) => existing with { ContentType = contentType });

        var expires = DateTimeOffset.UtcNow.AddMinutes(_options.UploadSasMinutes);
        var url = BuildDevUrl(blobPath, "cw", expires);
        return Task.FromResult(new BlobUploadTicket(url, expires, blobPath));
    }

    public Task<BlobReadTicket> CreateReadSasAsync(
        string blobPath,
        CancellationToken cancellationToken = default)
    {
        var expires = DateTimeOffset.UtcNow.AddMinutes(_options.ReadSasMinutes);
        var url = BuildDevUrl(blobPath, "r", expires);
        return Task.FromResult(new BlobReadTicket(url, expires));
    }

    public Task<BlobProperties> GetPropertiesAsync(
        string blobPath,
        CancellationToken cancellationToken = default)
    {
        var filePath = ResolveFilePath(blobPath);
        if (filePath is not null && File.Exists(filePath))
        {
            var info = new FileInfo(filePath);
            var contentType = _blobs.TryGetValue(blobPath, out var blob) && !string.IsNullOrWhiteSpace(blob.ContentType)
                ? blob.ContentType
                : "application/octet-stream";
            return Task.FromResult(new BlobProperties(true, info.Length, contentType));
        }

        if (_blobs.TryGetValue(blobPath, out var memory) && memory.Uploaded)
            return Task.FromResult(new BlobProperties(true, memory.SizeBytes, memory.ContentType));

        return Task.FromResult(new BlobProperties(false, null, null));
    }

    public Task<bool> TryCompleteUploadAsync(
        string blobPath,
        long sizeBytes,
        string contentType,
        CancellationToken cancellationToken = default)
    {
        if (!_blobs.ContainsKey(blobPath))
            return Task.FromResult(false);

        var filePath = ResolveFilePath(blobPath);
        if (filePath is not null && File.Exists(filePath) && new FileInfo(filePath).Length > 0)
        {
            var length = new FileInfo(filePath).Length;
            _blobs[blobPath] = new MemoryBlob(true, length, contentType);
            return Task.FromResult(true);
        }

        // Unit tests mark complete without a PUT body.
        if (!_options.RequireDevBlobBytesOnComplete)
        {
            MarkUploaded(blobPath, sizeBytes, contentType);
            return Task.FromResult(true);
        }

        return Task.FromResult(false);
    }

    public Task DeleteAsync(string blobPath, CancellationToken cancellationToken = default)
    {
        _blobs.TryRemove(blobPath, out _);
        var filePath = ResolveFilePath(blobPath);
        if (filePath is not null && File.Exists(filePath))
            File.Delete(filePath);
        return Task.CompletedTask;
    }

    public bool TryWriteBlob(string blobPath, ReadOnlySpan<byte> content, string? contentType)
    {
        if (!_blobs.ContainsKey(blobPath))
            return false;

        var filePath = ResolveFilePath(blobPath);
        if (filePath is null)
            return false;

        Directory.CreateDirectory(Path.GetDirectoryName(filePath)!);
        File.WriteAllBytes(filePath, content.ToArray());

        var type = string.IsNullOrWhiteSpace(contentType) ? "application/octet-stream" : contentType.Trim();
        _blobs[blobPath] = new MemoryBlob(true, content.Length, type);
        return true;
    }

    public bool TryOpenReadStream(string blobPath, out FileStream? stream, out string contentType, out long length)
    {
        stream = null;
        contentType = "application/octet-stream";
        length = 0;

        var filePath = ResolveFilePath(blobPath);
        if (filePath is null || !File.Exists(filePath))
            return false;

        var info = new FileInfo(filePath);
        if (info.Length == 0)
            return false;

        length = info.Length;
        if (_blobs.TryGetValue(blobPath, out var blob) && !string.IsNullOrWhiteSpace(blob.ContentType))
            contentType = blob.ContentType;

        stream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read);
        return true;
    }

    /// <summary>Marks a reserved path as uploaded — used by tests and upload-complete in InMemory mode.</summary>
    public void MarkUploaded(string blobPath, long sizeBytes, string contentType)
    {
        _blobs[blobPath] = new MemoryBlob(true, sizeBytes, contentType);
    }

    public bool HasReservation(string blobPath) => _blobs.ContainsKey(blobPath);

    private string? ResolveFilePath(string blobPath)
    {
        if (string.IsNullOrWhiteSpace(blobPath))
            return null;

        var normalized = blobPath.Replace('\\', '/').TrimStart('/');
        var fullPath = Path.GetFullPath(Path.Combine(_blobRoot, normalized.Replace('/', Path.DirectorySeparatorChar)));
        var rootFull = Path.GetFullPath(_blobRoot);
        if (!fullPath.StartsWith(rootFull, StringComparison.OrdinalIgnoreCase))
            return null;

        return fullPath;
    }

    private string BuildDevUrl(string blobPath, string permissions, DateTimeOffset expires)
    {
        var baseUrl = (_options.PublicBaseUrl ?? "http://localhost:5080").TrimEnd('/');
        var encodedPath = string.Join('/', blobPath.Split('/', StringSplitOptions.RemoveEmptyEntries)
            .Select(Uri.EscapeDataString));
        return $"{baseUrl}/api/dev/blobs/{encodedPath}?sv=dev&se={Uri.EscapeDataString(expires.ToString("O"))}&sp={permissions}";
    }

    private sealed record MemoryBlob(bool Uploaded, long SizeBytes, string ContentType);
}
