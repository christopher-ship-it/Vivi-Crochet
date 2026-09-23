using System.Text.RegularExpressions;
using VIVI.Core.Exceptions;

namespace VIVI.Core;

public static class VideoFileRules
{
    public const long DefaultMaxBytes = 2L * 1024 * 1024 * 1024;

    public static readonly HashSet<string> AllowedExtensions =
        new(StringComparer.OrdinalIgnoreCase) { ".mp4", ".mov", ".webm" };

    public static readonly HashSet<string> AllowedContentTypes =
        new(StringComparer.OrdinalIgnoreCase)
        {
            "video/mp4",
            "video/quicktime",
            "video/webm"
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

    public static string GetExtension(string fileName)
    {
        var ext = Path.GetExtension(fileName);
        return string.IsNullOrEmpty(ext) ? string.Empty : ext;
    }

    public static void Validate(string fileName, string contentType, long fileSizeBytes, long maxBytes)
    {
        if (fileSizeBytes <= 0)
            throw new ViviException("INVALID_FILE_SIZE", "File size must be greater than zero.");

        if (fileSizeBytes > maxBytes)
            throw new ViviException(
                "FILE_TOO_LARGE",
                $"File exceeds the maximum size of {maxBytes} bytes.",
                400);

        var extension = GetExtension(fileName);
        if (!AllowedExtensions.Contains(extension))
            throw new ViviException(
                "INVALID_FILE_TYPE",
                "Only .mp4, .mov and .webm files are allowed.");

        if (string.IsNullOrWhiteSpace(contentType) || !AllowedContentTypes.Contains(contentType.Trim()))
            throw new ViviException(
                "INVALID_CONTENT_TYPE",
                "Content type must be video/mp4, video/quicktime, or video/webm.");
    }

    public static string BuildOriginalBlobPath(Guid courseId, Guid videoId, string sanitizedFileName)
        => $"courses/{courseId:D}/videos/{videoId:D}/original/{sanitizedFileName}";

    public static string BuildPlayableBlobPath(Guid courseId, Guid videoId)
        => $"courses/{courseId:D}/videos/{videoId:D}/playable/lesson.mp4";
}
