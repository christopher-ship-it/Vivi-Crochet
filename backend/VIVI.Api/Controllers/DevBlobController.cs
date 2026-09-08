using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Storage;

namespace VIVI.Api.Controllers;

/// <summary>
/// Development-only blob PUT/GET for InMemory storage. Phones stream from the LAN IP, not localhost.
/// </summary>
[ApiController]
[Route("api/dev/blobs")]
[AllowAnonymous]
public sealed class DevBlobController : ControllerBase
{
    private readonly IBlobStorageService _blob;
    private readonly IWebHostEnvironment _env;

    public DevBlobController(IBlobStorageService blob, IWebHostEnvironment env)
    {
        _blob = blob;
        _env = env;
    }

    [HttpPut("{**blobPath}")]
    [RequestSizeLimit(2_147_483_648)]
    public async Task<IActionResult> Put(string blobPath, CancellationToken cancellationToken)
    {
        if (!_env.IsDevelopment())
            return NotFound();

        if (_blob is not InMemoryBlobStorageService inMemory)
            return NotFound();

        await using var ms = new MemoryStream();
        await Request.Body.CopyToAsync(ms, cancellationToken);
        if (ms.Length == 0)
            return BadRequest("Empty upload body.");

        var contentType = Request.ContentType ?? "application/octet-stream";
        if (!inMemory.TryWriteBlob(blobPath, ms.ToArray(), contentType))
            return NotFound("Blob path was not reserved. Request a new upload URL.");

        return Ok();
    }

    [HttpGet("{**blobPath}")]
    public IActionResult Get(string blobPath)
    {
        if (!_env.IsDevelopment())
            return NotFound();

        if (_blob is not InMemoryBlobStorageService inMemory)
            return NotFound();

        if (!inMemory.TryOpenReadStream(blobPath, out var stream, out var contentType, out var total) || stream is null)
            return NotFound("Video file not found. Re-upload the lesson from the admin dashboard.");

        Response.Headers.AcceptRanges = "bytes";
        var rangeHeader = Request.Headers.Range.ToString();

        if (string.IsNullOrWhiteSpace(rangeHeader) || !rangeHeader.StartsWith("bytes=", StringComparison.OrdinalIgnoreCase))
            return File(stream, contentType, enableRangeProcessing: true);

        var spec = rangeHeader["bytes=".Length..].Split('-', 2);
        if (!long.TryParse(spec[0], out var start))
            start = 0;

        long end = spec.Length > 1 && long.TryParse(spec[1], out var parsedEnd)
            ? parsedEnd
            : total - 1;

        if (start < 0 || start >= total)
        {
            stream.Dispose();
            return StatusCode(StatusCodes.Status416RangeNotSatisfiable);
        }

        end = Math.Min(end, total - 1);
        var length = (int)(end - start + 1);

        using (stream)
        {
            stream.Seek(start, SeekOrigin.Begin);
            var buffer = new byte[length];
            _ = stream.Read(buffer, 0, length);
            Response.StatusCode = StatusCodes.Status206PartialContent;
            Response.Headers.ContentRange = $"bytes {start}-{end}/{total}";
            return File(buffer, contentType);
        }
    }
}
