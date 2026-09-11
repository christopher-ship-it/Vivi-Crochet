using System.Text.RegularExpressions;
using VIVI.Core.Exceptions;

namespace VIVI.Core;

public static class ImageFileRules
{
    public const long DefaultMaxBytes = 5L * 1024 * 1024;
    public const int MaxImagesPerProduct = 5;

    public static readonly HashSet<string> AllowedExtensions =
        new(StringComparer.OrdinalIgnoreCase) { ".jpg", ".jpeg", ".png", ".webp" };

    public static readonly HashSet<string> AllowedContentTypes =
        new(StringComparer.OrdinalIgnoreCase)
        {
            "image/jpeg",
            "image/png",
            "image/webp"
        };

    public static string SanitizeFileName(string fileName)
    {
        var name = Path.GetFileName(fileName ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(name))
            throw new ViviException("INVALID_FILE_NAME", "A file name is required.");

        name = name.Replace(" ", "-");
        name = Regex.Replace(name, @"[^a-zA-Z0-9._-]", string.Empty);
        name = Regex.Replace(name, @"\.+", ".");

        if (name.Length > 180)
            name = name[^180..];

        if (string.IsNullOrWhiteSpace(name) || name is "." or "..")
            throw new ViviException("INVALID_FILE_NAME", "The file name is not valid.");

        return name;
    }

    public static void Validate(string fileName, string contentType, long fileSizeBytes, long maxBytes)
    {
        if (fileSizeBytes <= 0)
            throw new ViviException("INVALID_FILE_SIZE", "File size must be greater than zero.");

        if (fileSizeBytes > maxBytes)
            throw new ViviException(
                "FILE_TOO_LARGE",
                $"Image exceeds the maximum size of {maxBytes} bytes.",
                400);

        var extension = Path.GetExtension(fileName);
        if (!AllowedExtensions.Contains(extension))
            throw new ViviException(
                "INVALID_FILE_TYPE",
                "Only .jpg, .jpeg, .png and .webp images are allowed.");

        if (string.IsNullOrWhiteSpace(contentType) || !AllowedContentTypes.Contains(contentType.Trim()))
            throw new ViviException(
                "INVALID_CONTENT_TYPE",
                "Content type must be image/jpeg, image/png, or image/webp.");
    }

    public static string BuildBlobPath(Guid productId, string sanitizedFileName)
        => $"products/{productId:D}/image/{sanitizedFileName}";

    public static bool IsOwnedBlobPath(Guid productId, string blobPath)
        => blobPath.StartsWith($"products/{productId:D}/image/", StringComparison.OrdinalIgnoreCase);

    public static string BuildCourseThumbnailBlobPath(Guid courseId, string sanitizedFileName)
        => $"courses/{courseId:D}/thumbnail/{sanitizedFileName}";

    public static bool IsOwnedCourseThumbnailPath(Guid courseId, string blobPath)
        => blobPath.StartsWith($"courses/{courseId:D}/thumbnail/", StringComparison.OrdinalIgnoreCase);
}
