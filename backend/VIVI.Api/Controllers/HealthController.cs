using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace VIVI.Api.Controllers;

[ApiController]
[Route("api/health")]
public sealed class HealthController : ControllerBase
{
    /// <summary>Liveness check for local runs and Azure App Service.</summary>
    [HttpGet]
    [AllowAnonymous]
    public IActionResult Get() => Ok(new { status = "ok" });
}
