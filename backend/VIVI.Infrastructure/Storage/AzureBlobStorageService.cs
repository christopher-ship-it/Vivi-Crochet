using Azure.Storage;
using Azure.Storage.Blobs;
using Azure.Storage.Sas;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Configuration;

namespace VIVI.Infrastructure.Storage;

public sealed class AzureBlobStorageService : IBlobStorageService
{
    private readonly BlobContainerClient _container;
    private readonly StorageSharedKeyCredential? _sharedKey;
    private readonly BlobStorageOptions _options;
    private readonly ILogger<AzureBlobStorageService> _logger;

    public AzureBlobStorageService(IOptions<BlobStorageOptions> options, ILogger<AzureBlobStorageService> logger)
    {
        _options = options.Value;
        _logger = logger;

        if (string.IsNullOrWhiteSpace(_options.ConnectionString))
            throw new InvalidOperationException("Blob:ConnectionString must be set when Blob:Provider is Azure.");

        var service = new BlobServiceClient(_options.ConnectionString);
        _container = service.GetBlobContainerClient(_options.ContainerName);
        _sharedKey = TryGetSharedKey(_options.ConnectionString);
    }

    public async Task<BlobUploadTicket> CreateUploadSasAsync(
        string blobPath,
        string contentType,
        CancellationToken cancellationToken = default)
    {
        await _container.CreateIfNotExistsAsync(cancellationToken: cancellationToken);
        var blob = _container.GetBlobClient(blobPath);
        var expires = DateTimeOffset.UtcNow.AddMinutes(_options.UploadSasMinutes);
        var sas = BuildSas(blob, expires, BlobSasPermissions.Create | BlobSasPermissions.Write);
        return new BlobUploadTicket(sas, expires, blobPath);
    }

    public async Task<BlobReadTicket> CreateReadSasAsync(
        string blobPath,
        CancellationToken cancellationToken = default)
    {
        await _container.CreateIfNotExistsAsync(cancellationToken: cancellationToken);
        var blob = _container.GetBlobClient(blobPath);
        var expires = DateTimeOffset.UtcNow.AddMinutes(_options.ReadSasMinutes);
        var sas = BuildSas(blob, expires, BlobSasPermissions.Read);
        return new BlobReadTicket(sas, expires);
    }

    public async Task<BlobProperties> GetPropertiesAsync(
        string blobPath,
        CancellationToken cancellationToken = default)
    {
        var blob = _container.GetBlobClient(blobPath);
        var exists = await blob.ExistsAsync(cancellationToken);
        if (!exists.Value)
            return new BlobProperties(false, null, null);

        var props = await blob.GetPropertiesAsync(cancellationToken: cancellationToken);
        return new BlobProperties(true, props.Value.ContentLength, props.Value.ContentType);
    }

    public async Task<bool> TryCompleteUploadAsync(
        string blobPath,
        long sizeBytes,
        string contentType,
        CancellationToken cancellationToken = default)
    {
        var props = await GetPropertiesAsync(blobPath, cancellationToken);
        return props.Exists;
    }

    public async Task DeleteAsync(string blobPath, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(blobPath))
            return;

        var blob = _container.GetBlobClient(blobPath);
        await blob.DeleteIfExistsAsync(cancellationToken: cancellationToken);
        _logger.LogInformation("Deleted blob {BlobPath}", blobPath);
    }

    private string BuildSas(BlobClient blob, DateTimeOffset expiresOn, BlobSasPermissions permissions)
    {
        if (_sharedKey is not null)
        {
            var builder = new BlobSasBuilder
            {
                BlobContainerName = _container.Name,
                BlobName = blob.Name,
                Resource = "b",
                StartsOn = DateTimeOffset.UtcNow.AddMinutes(-2),
                ExpiresOn = expiresOn,
                ContentType = null
            };
            builder.SetPermissions(permissions);
            var sas = builder.ToSasQueryParameters(_sharedKey).ToString();
            return $"{blob.Uri}?{sas}";
        }

        if (blob.CanGenerateSasUri)
            return blob.GenerateSasUri(permissions, expiresOn).ToString();

        throw new InvalidOperationException(
            "Cannot generate a SAS URL. The connection string must include an AccountKey, or the process must use a credential that can sign SAS tokens.");
    }

    private static StorageSharedKeyCredential? TryGetSharedKey(string connectionString)
    {
        try
        {
            string? name = null;
            string? key = null;
            foreach (var part in connectionString.Split(';', StringSplitOptions.RemoveEmptyEntries))
            {
                var idx = part.IndexOf('=');
                if (idx <= 0) continue;
                var k = part[..idx].Trim();
                var v = part[(idx + 1)..].Trim();
                if (k.Equals("AccountName", StringComparison.OrdinalIgnoreCase)) name = v;
                if (k.Equals("AccountKey", StringComparison.OrdinalIgnoreCase)) key = v;
            }

            if (!string.IsNullOrWhiteSpace(name) && !string.IsNullOrWhiteSpace(key))
                return new StorageSharedKeyCredential(name, key);
        }
        catch
        {
            // Fall through to CanGenerateSasUri.
        }

        return null;
    }
}
