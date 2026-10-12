using System.Net;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VIVI.Api.Services;
using VIVI.Core.Enums;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Data;

namespace VIVI.Api.Controllers;

/// <summary>
/// Public share links: <c>/p/{id}</c> (product) and <c>/c/{id}</c> (course) on go.vivicrochet01.com.
/// Serves Open Graph tags so WhatsApp / Instagram / iMessage show a preview card, plus
/// an "Open in app" page. Also hosts the Android / iOS app-link verification files.
/// </summary>
[ApiController]
[AllowAnonymous]
[ApiExplorerSettings(IgnoreApi = true)]
public sealed class ShareController : ControllerBase
{
    private const string AndroidPackage = "in.vivicrochet.app";
    private const string IosBundleId = "in.vivicrochet.app";
    private const string PlayStoreUrl = "https://play.google.com/store/apps/details?id=" + AndroidPackage;

    private readonly ViviDbContext _db;
    private readonly IBlobStorageService _blob;
    private readonly IConfiguration _config;
    private readonly IHttpClientFactory _http;

    public ShareController(ViviDbContext db, IBlobStorageService blob, IConfiguration config, IHttpClientFactory http)
    {
        _db = db;
        _blob = blob;
        _config = config;
        _http = http;
    }

    private string SiteUrl => (_config["Share:SiteUrl"] ?? "https://go.vivicrochet01.com").TrimEnd('/');

    [HttpGet("/p/{id:guid}")]
    public async Task<IActionResult> Product(Guid id, CancellationToken ct)
    {
        var p = await _db.Products.AsNoTracking()
            .Include(x => x.Images)
            .FirstOrDefaultAsync(x => x.Id == id && x.Status == ProductStatus.Published, ct);
        if (p is null) return NotFoundPage();

        var imageRaw = p.Images.OrderByDescending(i => i.IsMain).ThenBy(i => i.SortOrder)
            .Select(i => i.BlobPath).FirstOrDefault() ?? p.ImageUrl;
        var desc = string.IsNullOrWhiteSpace(p.Description) ? "Handmade crochet & yarn from VIVI Crochet." : p.Description!;
        return Page(p.Name, $"₹{p.Price:N0} · {desc}", $"{SiteUrl}/share-img/p/{id}", $"/p/{id}", $"vivi://product/{id}");
    }

    [HttpGet("/c/{id:guid}")]
    public async Task<IActionResult> Course(Guid id, CancellationToken ct)
    {
        var c = await _db.Courses.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == id && x.Status == CourseStatus.Published, ct);
        if (c is null) return NotFoundPage();

        var desc = string.IsNullOrWhiteSpace(c.Description) ? "Learn crochet step by step with VIVI Crochet." : c.Description!;
        return Page(c.Name, $"₹{c.Price:N0} · {desc}", $"{SiteUrl}/share-img/c/{id}", $"/c/{id}", $"vivi://course/{id}");
    }

    /// <summary>
    /// Preview image for a product. Served from our own domain (a stable, absolute URL that crawlers
    /// can always fetch, unlike an expiring blob SAS link); falls back to the VIVI brand card.
    /// </summary>
    [HttpGet("/share-img/p/{id:guid}")]
    public async Task<IActionResult> ProductImage(Guid id, CancellationToken ct)
    {
        var raw = await _db.Products.AsNoTracking()
            .Where(x => x.Id == id && x.Status == ProductStatus.Published)
            .Select(x => x.Images.OrderByDescending(i => i.IsMain).ThenBy(i => i.SortOrder)
                .Select(i => i.BlobPath).FirstOrDefault() ?? x.ImageUrl)
            .FirstOrDefaultAsync(ct);
        return await ImageOrDefaultAsync(raw, ct);
    }

    [HttpGet("/share-img/c/{id:guid}")]
    public async Task<IActionResult> CourseImage(Guid id, CancellationToken ct)
    {
        var raw = await _db.Courses.AsNoTracking()
            .Where(x => x.Id == id && x.Status == CourseStatus.Published)
            .Select(x => x.ThumbnailUrl)
            .FirstOrDefaultAsync(ct);

        // Bundles (e.g. Crochet Circle) often have no thumbnail of their own: use an included course's.
        if (string.IsNullOrWhiteSpace(raw))
        {
            raw = await _db.CourseBundleItems.AsNoTracking()
                .Where(b => b.BundleCourseId == id && b.IncludedCourse!.ThumbnailUrl != null)
                .OrderBy(b => b.SortOrder)
                .Select(b => b.IncludedCourse!.ThumbnailUrl)
                .FirstOrDefaultAsync(ct);
        }
        return await ImageOrDefaultAsync(raw, ct);
    }

    private async Task<IActionResult> ImageOrDefaultAsync(string? raw, CancellationToken ct)
    {
        try
        {
            var url = await ProductImageResolver.ResolveAsync(raw, _blob, ct);
            if (!string.IsNullOrEmpty(url))
            {
                var resp = await _http.CreateClient().GetAsync(url, HttpCompletionOption.ResponseHeadersRead, ct);
                if (resp.IsSuccessStatusCode)
                {
                    var bytes = await resp.Content.ReadAsByteArrayAsync(ct);
                    Response.Headers.CacheControl = "public, max-age=86400";
                    return File(bytes, resp.Content.Headers.ContentType?.MediaType ?? "image/jpeg");
                }
            }
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException && !ct.IsCancellationRequested)
        {
            // fall through to the brand image
        }

        var path = Path.Combine(AppContext.BaseDirectory, "Assets", "share-default.jpg");
        Response.Headers.CacheControl = "public, max-age=3600";
        return System.IO.File.Exists(path) ? PhysicalFile(path, "image/jpeg") : NotFound();
    }

    [HttpGet("/live")]
    public IActionResult Live() =>
        Page("Live crochet classes with Vivi",
            "Learn crochet live with Vivi: weekday classes, a Saturday replacement class and small circles. Book your seat in the VIVI Crochet app.",
            $"{SiteUrl}/share-img/default", "/live", "vivi://live");

    [HttpGet("/share-img/default")]
    public Task<IActionResult> DefaultImage(CancellationToken ct) => ImageOrDefaultAsync(null, ct);

    [HttpGet("/.well-known/assetlinks.json")]
    public IActionResult AssetLinks()
    {
        var fingerprints = _config.GetSection("Share:AndroidSha256Fingerprints").Get<string[]>() ?? [];
        return new JsonResult(new[]
        {
            new
            {
                relation = new[] { "delegate_permission/common.handle_all_urls" },
                target = new
                {
                    @namespace = "android_app",
                    package_name = AndroidPackage,
                    sha256_cert_fingerprints = fingerprints,
                },
            },
        });
    }

    [HttpGet("/.well-known/apple-app-site-association")]
    public IActionResult AppleAssociation()
    {
        var team = _config["Share:AppleTeamId"] ?? "";
        return new JsonResult(new
        {
            applinks = new
            {
                apps = Array.Empty<string>(),
                details = new[]
                {
                    new { appID = $"{team}.{IosBundleId}", paths = new[] { "/p/*", "/c/*", "/live" } },
                },
            },
        });
    }

    private IActionResult NotFoundPage() =>
        Content(Html("VIVI Crochet", "This link is no longer available.", null, "/", "vivi://", noindex: true),
            "text/html; charset=utf-8");

    private IActionResult Page(string title, string description, string? image, string path, string appUrl)
    {
        if (description.Length > 200) description = description[..197] + "...";
        Response.Headers.CacheControl = "public, max-age=300";
        return Content(Html(title, description, image, path, appUrl), "text/html; charset=utf-8");
    }

    private string Html(string title, string description, string? image, string path, string appUrl, bool noindex = false)
    {
        string E(string s) => WebUtility.HtmlEncode(s);
        var url = SiteUrl + path;
        var img = string.IsNullOrEmpty(image)
            ? ""
            : $"""<meta property="og:image" content="{E(image)}"><meta name="twitter:image" content="{E(image)}">""";
        var card = string.IsNullOrEmpty(image) ? "" : $"""<img src="{E(image)}" alt="" style="width:100%;border-radius:16px;margin-bottom:16px">""";
        return $$"""
<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{{E(title)}} · VIVI Crochet</title>
<meta name="description" content="{{E(description)}}">
{{(noindex ? "<meta name=\"robots\" content=\"noindex\">" : "")}}
<meta property="og:type" content="website"><meta property="og:site_name" content="VIVI Crochet">
<meta property="og:title" content="{{E(title)}}"><meta property="og:description" content="{{E(description)}}">
<meta property="og:url" content="{{E(url)}}">{{img}}
<meta name="twitter:card" content="summary_large_image">
<style>body{font-family:system-ui,sans-serif;background:#fcf3ee;color:#2b2326;margin:0;padding:24px;display:flex;justify-content:center}
.c{max-width:420px;width:100%}h1{font-size:22px;margin:0 0 8px}p{line-height:1.5;margin:0 0 20px}
a.b{display:block;text-align:center;padding:14px;border-radius:12px;background:#e0527f;color:#fff;text-decoration:none;font-weight:600;margin-bottom:10px}</style>
</head><body><div class="c">{{card}}<h1>{{E(title)}}</h1><p>{{E(description)}}</p>
<a class="b" href="{{E(appUrl)}}">Open in VIVI app</a>
<a class="b" style="background:#2b2326" href="{{PlayStoreUrl}}">Get the app on Google Play</a></div></body></html>
""";
    }
}
