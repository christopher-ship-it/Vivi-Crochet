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

    public ShareController(ViviDbContext db, IBlobStorageService blob, IConfiguration config)
    {
        _db = db;
        _blob = blob;
        _config = config;
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
        var image = await ProductImageResolver.ResolveAsync(imageRaw, _blob, ct);
        var desc = string.IsNullOrWhiteSpace(p.Description) ? "Handmade crochet & yarn from VIVI Crochet." : p.Description!;
        return Page(p.Name, $"₹{p.Price:N0} · {desc}", image, $"/p/{id}", $"vivi://product/{id}");
    }

    [HttpGet("/c/{id:guid}")]
    public async Task<IActionResult> Course(Guid id, CancellationToken ct)
    {
        var c = await _db.Courses.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == id && x.Status == CourseStatus.Published, ct);
        if (c is null) return NotFoundPage();

        var image = await ProductImageResolver.ResolveAsync(c.ThumbnailUrl, _blob, ct);
        var desc = string.IsNullOrWhiteSpace(c.Description) ? "Learn crochet step by step with VIVI Crochet." : c.Description!;
        return Page(c.Name, $"₹{c.Price:N0} · {desc}", image, $"/c/{id}", $"vivi://course/{id}");
    }

    [HttpGet("/live")]
    public IActionResult Live() =>
        Page("Live crochet classes with Vivi",
            "Learn crochet live with Vivi: weekday classes, a Saturday replacement class and small circles. Book your seat in the VIVI Crochet app.",
            null, "/live", "vivi://live");

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
