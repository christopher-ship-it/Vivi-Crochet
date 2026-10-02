using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using VIVI.Api.Auth;
using VIVI.Api.Services;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Commerce;

namespace VIVI.Api.Controllers;

/// <summary>Bulk product upload from a spreadsheet: columns, import, and publish-with-photos.</summary>
[ApiController]
[Route("api/admin/products/import")]
[Authorize(Roles = AuthRoles.Console)]
public sealed class AdminProductImportController : ControllerBase
{
    private readonly ProductImportService _import;

    private readonly IBlobStorageService _blob;

    public AdminProductImportController(ProductImportService import, IBlobStorageService blob)
    {
        _import = import;
        _blob = blob;
    }

    /// <summary>The upload sheet's columns (names match the admin product form). The admin builds its sample file from this.</summary>
    [HttpGet("columns")]
    [ProducesResponseType(typeof(IReadOnlyList<ProductImportColumn>), StatusCodes.Status200OK)]
    public ActionResult<IReadOnlyList<ProductImportColumn>> Columns() => Ok(ProductImportColumns.All);

    /// <summary>
    /// Checks the rows and, unless <c>dryRun</c> is set, saves them. All or nothing: if any row has an
    /// error, nothing is saved and every error is returned with its row number.
    /// </summary>
    [HttpPost]
    [ProducesResponseType(typeof(ProductImportResult), StatusCodes.Status200OK)]
    public async Task<ActionResult<ProductImportResult>> Import(
        [FromBody] ProductImportRequest request,
        CancellationToken cancellationToken) =>
        Ok(await _import.ImportAsync(request, cancellationToken));

    public sealed class PublishRequest
    {
        public List<string> ProductCodes { get; set; } = new();
    }

    /// <summary>Publishes the given products that already have a photo (and their listings). Others stay Draft.</summary>
    [HttpPost("publish")]
    [ProducesResponseType(typeof(ProductPublishResult), StatusCodes.Status200OK)]
    public async Task<ActionResult<ProductPublishResult>> Publish(
        [FromBody] PublishRequest request,
        CancellationToken cancellationToken) =>
        Ok(await _import.PublishWithPhotosAsync(request.ProductCodes, cancellationToken));

    /// <summary>How many draft products "delete all drafts" would remove.</summary>
    [HttpGet("drafts")]
    [ProducesResponseType(typeof(ProductDraftCount), StatusCodes.Status200OK)]
    public async Task<ActionResult<ProductDraftCount>> CountDrafts(CancellationToken cancellationToken) =>
        Ok(await _import.CountDraftsAsync(cancellationToken));

    /// <summary>Deletes every draft product (and its photos). Published products are never touched.</summary>
    [HttpDelete("drafts")]
    [ProducesResponseType(typeof(ProductDraftDeleteResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<ProductDraftDeleteResponse>> DeleteDrafts(CancellationToken cancellationToken)
    {
        var result = await _import.DeleteDraftsAsync(cancellationToken);

        foreach (var path in result.BlobPaths.Where(ProductImageResolver.IsBlobPath))
            await _blob.DeleteAsync(path, cancellationToken);

        return Ok(new ProductDraftDeleteResponse { Deleted = result.Deleted });
    }

    public sealed class ProductDraftDeleteResponse
    {
        public int Deleted { get; set; }
    }
}
