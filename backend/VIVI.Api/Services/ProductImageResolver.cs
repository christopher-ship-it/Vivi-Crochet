using VIVI.Api.DTOs.Products;
using VIVI.Core.Interfaces;

namespace VIVI.Api.Services;

public static class ProductImageResolver
{
    public static bool IsBlobPath(string? imageUrl) =>
        !string.IsNullOrWhiteSpace(imageUrl)
        && !imageUrl.StartsWith("http://", StringComparison.OrdinalIgnoreCase)
        && !imageUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase);

    /// <param name="verifyExists">
    /// When true, issues a blob HEAD before SAS (slow). Prefer false on list endpoints.
    /// </param>
    public static async Task<string?> ResolveAsync(
        string? imageUrl,
        IBlobStorageService blob,
        CancellationToken cancellationToken,
        bool verifyExists = false)
    {
        if (string.IsNullOrWhiteSpace(imageUrl))
            return null;

        if (!IsBlobPath(imageUrl))
            return imageUrl;

        if (verifyExists)
        {
            var props = await blob.GetPropertiesAsync(imageUrl, cancellationToken);
            if (!props.Exists)
                return null;
        }

        var ticket = await blob.CreateReadSasAsync(imageUrl, cancellationToken);
        return ticket.ReadUrl;
    }

    public static async Task ResolveProductAsync(
        ProductResponse dto,
        IBlobStorageService blob,
        CancellationToken cancellationToken,
        bool verifyExists = false)
    {
        dto.ImageUrl = await ResolveAsync(dto.ImageUrl, blob, cancellationToken, verifyExists);

        if (dto.Images.Count == 0)
            return;

        var resolved = await Task.WhenAll(dto.Images.Select(async image =>
        {
            var url = await ResolveAsync(image.BlobPath, blob, cancellationToken, verifyExists);
            return new ProductImageResponse
            {
                Id = image.Id,
                // Keep the gallery entry even if SAS resolution fails so admin count stays correct.
                Url = string.IsNullOrWhiteSpace(url) ? image.BlobPath : url,
                BlobPath = image.BlobPath,
                SortOrder = image.SortOrder,
                IsMain = image.IsMain
            };
        }));

        dto.Images = resolved;
        if (string.IsNullOrWhiteSpace(dto.ImageUrl))
            dto.ImageUrl = resolved.FirstOrDefault(i => i.IsMain)?.Url ?? resolved.FirstOrDefault()?.Url;

        if (dto.RecommendedEssentials.Count == 0)
            return;

        var essentials = await Task.WhenAll(dto.RecommendedEssentials.Select(async item =>
        {
            var url = await ResolveAsync(item.ImageUrl, blob, cancellationToken, verifyExists: false);
            return new RecommendedEssentialSummary
            {
                Id = item.Id,
                Name = item.Name,
                Category = item.Category,
                Price = item.Price,
                ImageUrl = url ?? item.ImageUrl,
                AvailableStock = item.AvailableStock
            };
        }));
        dto.RecommendedEssentials = essentials;
    }
}
