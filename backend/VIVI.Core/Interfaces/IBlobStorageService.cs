namespace VIVI.Core.Interfaces;

public sealed record BlobUploadTicket(
    string UploadUrl,
    DateTimeOffset ExpiresAt,
    string BlobPath);

public sealed record BlobReadTicket(
    string ReadUrl,
    DateTimeOffset ExpiresAt);

public sealed record BlobProperties(
    bool Exists,
    long? SizeBytes,
    string? ContentType);

public interface IBlobStorageService
{
    Task<BlobUploadTicket> CreateUploadSasAsync(
        string blobPath,
        string contentType,
        CancellationToken cancellationToken = default);

    Task<BlobReadTicket> CreateReadSasAsync(
        string blobPath,
        CancellationToken cancellationToken = default);

    Task<BlobProperties> GetPropertiesAsync(
        string blobPath,
        CancellationToken cancellationToken = default);

    Task DeleteAsync(string blobPath, CancellationToken cancellationToken = default);

    /// <summary>Downloads a blob to a local file path (overwrites if present).</summary>
    Task DownloadToFileAsync(
        string blobPath,
        string localFilePath,
        CancellationToken cancellationToken = default);

    /// <summary>Uploads a local file to the given blob path (creates/overwrites).</summary>
    Task UploadFromFileAsync(
        string blobPath,
        string localFilePath,
        string contentType,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Azure: returns whether the blob now exists after the browser PUT.
    /// InMemory: records the completed upload so later reads succeed.
    /// </summary>
    Task<bool> TryCompleteUploadAsync(
        string blobPath,
        long sizeBytes,
        string contentType,
        CancellationToken cancellationToken = default);
}
