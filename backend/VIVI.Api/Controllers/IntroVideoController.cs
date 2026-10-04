using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VIVI.Api.DTOs.Admin;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Data;

namespace VIVI.Api.Controllers;

/// <summary>What the mobile app needs to play the welcome video. No sign-in needed: it is shown on first launch.</summary>
[ApiController]
[Route("api/intro-video")]
[AllowAnonymous]
public sealed class IntroVideoController : ControllerBase
{
    private readonly ViviDbContext _db;
    private readonly IBlobStorageService _blob;

    public IntroVideoController(ViviDbContext db, IBlobStorageService blob)
    {
        _db = db;
        _blob = blob;
    }

    [HttpGet]
    [ProducesResponseType(typeof(IntroVideoResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<IntroVideoResponse>> Get(CancellationToken cancellationToken)
    {
        var intro = await _db.IntroVideos.AsNoTracking().FirstOrDefaultAsync(cancellationToken);
        if (intro is null || !intro.IsEnabled || string.IsNullOrWhiteSpace(intro.BlobPath))
            return Ok(new IntroVideoResponse());

        var props = await _blob.GetPropertiesAsync(intro.BlobPath, cancellationToken);
        if (!props.Exists)
            return Ok(new IntroVideoResponse());

        var ticket = await _blob.CreateReadSasAsync(intro.BlobPath, cancellationToken);
        return Ok(new IntroVideoResponse { Available = true, Url = ticket.ReadUrl, Version = intro.Version });
    }
}
