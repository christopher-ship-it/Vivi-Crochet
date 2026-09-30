using VIVI.Api.DTOs.Auth;
using VIVI.Api.DTOs.Categories;
using VIVI.Api.DTOs.Courses;
using VIVI.Api.DTOs.Products;
using VIVI.Api.DTOs.Videos;
using VIVI.Core.Enums;
using VIVI.Core.Entities;
using VIVI.Core.Enums;

namespace VIVI.Api.Mapping;

public static class DtoMapper
{
    public static AdminUserDto ToDto(this AdminUser user)
    {
        string? phone = null;
        const string prefix = "customer.";
        const string suffix = "@vivicrochet.dev";
        if (user.Email.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)
            && user.Email.EndsWith(suffix, StringComparison.OrdinalIgnoreCase))
        {
            phone = user.Email[prefix.Length..^suffix.Length];
        }

        return new AdminUserDto
        {
            Id = user.Id,
            Email = user.Email,
            Name = user.Name,
            Role = user.Role.ToString(),
            Phone = phone
        };
    }

    public static CategoryResponse ToDto(this Category category) => new()
    {
        Id = category.Id,
        Name = category.Name,
        Description = category.Description,
        SortOrder = category.SortOrder,
        IsActive = category.IsActive,
        CreatedAt = category.CreatedAt,
        UpdatedAt = category.UpdatedAt
    };

    public static CourseResponse ToDto(this Course course, bool includeLessons, bool adminView)
    {
        var ownVideos = course.Videos ?? [];
        var included = (course.BundleItems ?? Array.Empty<CourseBundleItem>())
            .OrderBy(b => b.SortOrder)
            .ToList();

        IEnumerable<Video> lessonSource;
        if (course.Type == CourseType.Bundle && included.Count > 0)
        {
            lessonSource = included.SelectMany(b => b.IncludedCourse?.Videos ?? Enumerable.Empty<Video>());
        }
        else
        {
            lessonSource = ownVideos;
        }

        var visible = adminView
            ? lessonSource
            : lessonSource.Where(v => v.Status == VideoStatus.Published);

        return new CourseResponse
        {
            Id = course.Id,
            CategoryId = course.CategoryId,
            CategoryName = course.Category?.Name,
            Name = course.Name,
            Type = course.Type,
            Level = course.Level,
            Description = course.Description,
            About = course.About,
            Price = course.Price,
            Mrp = course.Mrp,
            AccessDays = course.AccessDays,
            RenewalPercentage = course.RenewalPercentage,
            Languages = course.Languages,
            ThumbnailUrl = course.ThumbnailUrl,
            SortOrder = course.SortOrder,
            Status = course.Status,
            VideoCount = visible.Count(),
            CreatedAt = course.CreatedAt,
            UpdatedAt = course.UpdatedAt,
            CreatedBy = course.CreatedBy,
            Lessons = includeLessons
                ? visible.Select(v => new CourseLessonResponse
                {
                    Id = v.Id,
                    Title = v.Title,
                    Description = v.Description,
                    DurationSeconds = v.DurationSeconds,
                    IsFreePreview = v.IsFreePreview,
                    SortOrder = v.SortOrder,
                    Status = v.Status
                }).ToList()
                : null,
            IncludedCourses = included.Count == 0
                ? null
                : included.Select(b => new IncludedCourseResponse
                {
                    Id = b.IncludedCourseId,
                    Name = b.IncludedCourse?.Name ?? string.Empty,
                    AccessDays = b.IncludedCourse?.AccessDays ?? 0,
                    VideoCount = (b.IncludedCourse?.Videos ?? []).Count(v => adminView || v.Status == VideoStatus.Published)
                }).ToList(),
            LaunchOffer = adminView && course.LaunchOffer is not null
                ? new LaunchOfferAdminResponse
                {
                    LaunchPrice = course.LaunchOffer.LaunchPrice,
                    LaunchLimit = course.LaunchOffer.LaunchLimit,
                    RegularPriceAfterLaunch = course.LaunchOffer.RegularPriceAfterLaunch,
                    Mrp = course.LaunchOffer.Mrp,
                    CompletedPurchaseCount = course.LaunchOffer.CompletedPurchaseCount
                }
                : null
        };
    }

    public static VideoResponse ToDto(this Video video) => new()
    {
        Id = video.Id,
        CourseId = video.CourseId,
        Title = video.Title,
        Description = video.Description,
        DurationSeconds = video.DurationSeconds,
        VideoFileName = video.VideoFileName,
        FileSizeBytes = video.FileSizeBytes,
        ContentType = video.ContentType,
        PlayableFileSizeBytes = video.PlayableFileSizeBytes,
        PlayableContentType = video.PlayableContentType,
        TranscodeStatus = video.TranscodeStatus,
        TranscodeError = video.TranscodeError,
        IsFreePreview = video.IsFreePreview,
        UploadConfirmed = video.UploadConfirmed,
        Status = video.Status,
        SortOrder = video.SortOrder,
        CreatedAt = video.CreatedAt,
        UpdatedAt = video.UpdatedAt
    };

    public static ProductResponse ToDto(this Product product, bool adminView, int? videoCount = null)
    {
        Course? course = product.Course;
        LinkedCourseSummary? linked = null;

        if (course is not null && (adminView || course.Status == CourseStatus.Published))
        {
            var publishedVideos = course.Videos?.Count(v => v.Status == VideoStatus.Published) ?? 0;
            linked = new LinkedCourseSummary
            {
                Id = course.Id,
                Name = course.Name,
                Price = course.Price,
                VideoCount = videoCount
                    ?? (adminView ? (course.Videos?.Count ?? 0) : publishedVideos),
                Level = course.Level
            };
        }

        var images = (product.Images ?? Enumerable.Empty<ProductImage>())
            .OrderByDescending(i => i.IsMain)
            .ThenBy(i => i.SortOrder)
            .ThenBy(i => i.CreatedAt)
            .Select(i => new ProductImageResponse
            {
                Id = i.Id,
                Url = i.BlobPath,
                BlobPath = i.BlobPath,
                SortOrder = i.SortOrder,
                IsMain = i.IsMain
            })
            .ToList();

        if (images.Count == 0 && !string.IsNullOrWhiteSpace(product.ImageUrl))
        {
            images.Add(new ProductImageResponse
            {
                Id = product.Id,
                Url = product.ImageUrl,
                BlobPath = product.ImageUrl,
                SortOrder = 0,
                IsMain = true
            });
        }

        var variants = MapVariants(product, adminView);
        var displayPrice = product.Price;
        var displayMrp = product.Mrp;
        var displayStock = product.AvailableStock;
        var displayImage = product.ImageUrl;
        if (variants.Count > 0 && product.ParentProductId is null)
        {
            var first = variants[0];
            displayPrice = first.Price;
            displayMrp = first.Mrp;
            displayStock = variants.Sum(v => v.AvailableStock);
            if (string.IsNullOrWhiteSpace(displayImage))
                displayImage = first.ImageUrl;
        }

        return new ProductResponse
        {
            Id = product.Id,
            ProductCode = product.ProductCode,
            Name = product.Name,
            Category = product.Category,
            Description = product.Description,
            Price = displayPrice,
            Mrp = displayMrp,
            ImageUrl = displayImage,
            Images = images,
            Spec1 = product.Spec1,
            Spec2 = product.Spec2,
            BallWeight = product.BallWeight,
            YarnLength = product.YarnLength,
            CrochetHookSize = product.CrochetHookSize,
            ColourName = product.ColourName,
            ColourHex = product.ColourHex,
            ParentProductId = product.ParentProductId,
            VariantOptionName = product.ParentProductId is null
                ? (product.VariantOptionName ?? (variants.Count > 0 ? "Colour" : null))
                : (product.Parent?.VariantOptionName ?? (variants.Count > 0 ? "Colour" : null)),
            VariantCount = variants.Count,
            Variants = variants,
            CourseId = product.CourseId,
            LinkedCourse = linked,
            SortOrder = product.SortOrder,
            ProductType = product.ProductType,
            AvailableStock = displayStock,
            Status = product.Status,
            CreatedAt = product.CreatedAt,
            UpdatedAt = product.UpdatedAt,
            RecommendedEssentials = MapRecommendedEssentials(product, adminView)
        };
    }

    private static IReadOnlyList<ProductVariantSummary> MapVariants(Product product, bool adminView)
    {
        IEnumerable<Product> source;
        // Prefer sibling list from the parent when this row is itself a variant.
        if (product.ParentProductId is not null && product.Parent?.Variants is { Count: > 0 })
            source = product.Parent.Variants;
        else if (product.Variants is { Count: > 0 })
            source = product.Variants;
        else
            return Array.Empty<ProductVariantSummary>();

        return source
            .Where(v => v.ParentProductId == (product.ParentProductId ?? product.Id))
            .Where(v => adminView || v.Status == ProductStatus.Published)
            .GroupBy(v => v.Id)
            .Select(g => g.First())
            .OrderBy(v => v.SortOrder)
            .ThenBy(v => v.ColourName ?? v.Name, StringComparer.OrdinalIgnoreCase)
            .Select(v =>
            {
                var image = v.ImageUrl
                    ?? v.Images?.OrderByDescending(i => i.IsMain).ThenBy(i => i.SortOrder).Select(i => i.BlobPath).FirstOrDefault();
                return new ProductVariantSummary
                {
                    Id = v.Id,
                    ProductCode = v.ProductCode,
                    ColourName = v.ColourName,
                    ColourHex = v.ColourHex,
                    Price = v.Price,
                    Mrp = v.Mrp,
                    ImageUrl = image,
                    AvailableStock = v.AvailableStock,
                    Status = v.Status,
                    SortOrder = v.SortOrder
                };
            })
            .ToList();
    }

    private static IReadOnlyList<RecommendedEssentialSummary> MapRecommendedEssentials(
        Product product,
        bool adminView)
    {
        if (product.EssentialLinks is null || product.EssentialLinks.Count == 0)
            return Array.Empty<RecommendedEssentialSummary>();

        return product.EssentialLinks
            .OrderBy(l => l.SortOrder)
            .Select(l => l.EssentialProduct)
            .Where(p => p is not null)
            .Cast<Product>()
            .Where(p => adminView || (p.Status == ProductStatus.Published && p.AvailableStock > 0))
            .Take(3)
            .Select(p => new RecommendedEssentialSummary
            {
                Id = p.Id,
                Name = p.Name,
                Category = p.Category,
                Price = p.Price,
                ImageUrl = p.ImageUrl,
                AvailableStock = p.AvailableStock
            })
            .ToList();
    }
}
