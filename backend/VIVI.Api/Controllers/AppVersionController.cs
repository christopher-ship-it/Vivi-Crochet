using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace VIVI.Api.Controllers;

/// <summary>
/// Tells the app the lowest version allowed to run. Set <c>AppVersion__MinAndroid</c> (e.g. <c>1.0.18</c>)
/// in the API's app settings to force everyone below it to update from the Play Store.
/// Empty means no forced update.
/// </summary>
[ApiController]
[Route("api/app")]
public sealed class AppVersionController : ControllerBase
{
    private const string PlayStoreUrl = "https://play.google.com/store/apps/details?id=in.vivicrochet.app";

    private readonly IConfiguration _config;

    public AppVersionController(IConfiguration config) => _config = config;

    [HttpGet("version")]
    [AllowAnonymous]
    public IActionResult Get()
    {
        Response.Headers.CacheControl = "no-store";
        return Ok(new
        {
            minVersion = _config["AppVersion:MinAndroid"] ?? "",
            storeUrl = PlayStoreUrl,
        });
    }
}
