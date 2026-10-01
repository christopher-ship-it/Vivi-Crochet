using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using VIVI.Api.Auth;
using VIVI.Infrastructure.Commerce;

namespace VIVI.Api.Controllers;

/// <summary>Bulk product upload from a spreadsheet: columns, import, and publish-with-photos.</summary>
[ApiController]
[Route("api/admin/products/import")]
[Authorize(Roles = AuthRoles.Console)]
public sealed class AdminProductImportController : ControllerBase
{
    private readonly ProductImportService _import;

    public AdminProductImportController(ProductImportService import) => _import = import;

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
}
