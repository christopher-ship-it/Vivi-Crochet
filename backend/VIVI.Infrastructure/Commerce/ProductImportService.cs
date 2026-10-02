using System.Globalization;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Infrastructure.Data;

namespace VIVI.Infrastructure.Commerce;

public sealed class ProductImportRowInput
{
    /// <summary>Row number in the spreadsheet (header is row 1), used in messages.</summary>
    public int RowNumber { get; set; }
    /// <summary>Column header → cell text, exactly as in the sheet.</summary>
    public Dictionary<string, string?> Cells { get; set; } = new();
}

public sealed class ProductImportRequest
{
    /// <summary>Used for rows that have no Category.</summary>
    public string? DefaultCategory { get; set; }
    /// <summary>Check and report only; change nothing.</summary>
    public bool DryRun { get; set; }
    public List<ProductImportRowInput> Rows { get; set; } = new();
}

public sealed record ProductImportIssue(int Row, string Message);

public sealed class ProductImportSummary
{
    public int ListingsCreated { get; set; }
    public int ListingsUpdated { get; set; }
    public int ShadesCreated { get; set; }
    public int ShadesUpdated { get; set; }
    public int SingleProductsCreated { get; set; }
    public int SingleProductsUpdated { get; set; }
}

public sealed class ProductImportRowResult
{
    public int RowNumber { get; set; }
    public string ProductCode { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Shade { get; set; }
    /// <summary>Create, Update or Error.</summary>
    public string Action { get; set; } = string.Empty;
}

public sealed class ProductImportResult
{
    public bool DryRun { get; set; }
    /// <summary>True only when the rows were saved. Any error means nothing is saved.</summary>
    public bool Applied { get; set; }
    public List<ProductImportIssue> Errors { get; set; } = new();
    public List<ProductImportIssue> Warnings { get; set; } = new();
    public ProductImportSummary Summary { get; set; } = new();
    public List<ProductImportRowResult> Rows { get; set; } = new();
    /// <summary>Sheet columns that are not imported (unknown names, or ones kept only for reference).</summary>
    public List<string> IgnoredColumns { get; set; } = new();
    /// <summary>Codes of the products this upload creates or updates (used by the photos and publish steps).</summary>
    public List<string> ProductCodes { get; set; } = new();
}

public sealed class ProductPublishResult
{
    public int Published { get; set; }
    public int AlreadyPublished { get; set; }
    public int ListingsPublished { get; set; }
    /// <summary>Codes left as Draft because they have no photo yet.</summary>
    public List<string> SkippedNoPhoto { get; set; } = new();
    public List<string> NotFound { get; set; } = new();
}

/// <summary>
/// Bulk product upload. A sheet row is one product, or one shade of a listing: rows that share a
/// product name and have a shade name become the shades (variants) of a single listing, the same
/// structure the admin product form builds by hand. Matching is by product code, so uploading the
/// sheet again updates instead of duplicating; empty cells never erase existing data.
/// All rules live here so they can be tested without the browser.
/// </summary>
public sealed class ProductImportService
{
    private const int MaxRows = 2000;
    private static readonly Regex HexColour = new("^#?[0-9A-Fa-f]{6}$", RegexOptions.Compiled);

    private readonly ViviDbContext _db;

    public ProductImportService(ViviDbContext db) => _db = db;

    private sealed class ParsedRow
    {
        public int RowNumber;
        public string Name = string.Empty;
        public ProductType Type = ProductType.Resell;
        public string? Category;
        /// <summary>False when the category came from the upload's default, which must never overwrite an existing product's category.</summary>
        public bool CategoryExplicit;
        public string Code = string.Empty;
        public string? Shade;
        public string? Swatch;
        public int Price;
        public int? Mrp;
        public int? Stock;
        public string? Description, Spec1, Spec2;
        public string? BallWeight, YarnLength, HookSize, FibreBlend, YarnWeight, NeedleSize;
        public string? VariantLabel;
        public int? SortOrder;
        public int Index;
        public bool IsShade => !string.IsNullOrEmpty(Shade);
        public string ListingKey => $"{(int)Type}|{Name.ToUpperInvariant()}";
    }

    public async Task<ProductImportResult> ImportAsync(ProductImportRequest request, CancellationToken cancellationToken)
    {
        var result = new ProductImportResult { DryRun = request.DryRun };

        if (request.Rows.Count == 0)
        {
            result.Errors.Add(new ProductImportIssue(0, "The sheet has no product rows."));
            return result;
        }
        if (request.Rows.Count > MaxRows)
        {
            result.Errors.Add(new ProductImportIssue(0, $"A sheet can have at most {MaxRows} rows. Split it into smaller files."));
            return result;
        }

        var parsed = Parse(request, result);
        Validate(parsed, result);

        if (result.Errors.Count == 0)
            await PlanAndApplyAsync(parsed, request.DryRun, result, cancellationToken);

        result.Errors = result.Errors.OrderBy(e => e.Row).ThenBy(e => e.Message).ToList();
        result.Warnings = result.Warnings.OrderBy(e => e.Row).ThenBy(e => e.Message).ToList();
        if (result.Errors.Count > 0)
        {
            result.Applied = false;
            result.Summary = new ProductImportSummary();
            result.ProductCodes.Clear();
        }
        return result;
    }

    // ---------------------------------------------------------------- parsing

    private List<ParsedRow> Parse(ProductImportRequest request, ProductImportResult result)
    {
        var rows = new List<ParsedRow>();
        var ignored = new SortedSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var input in request.Rows)
        {
            var cells = new Dictionary<string, string>();
            foreach (var (header, rawValue) in input.Cells)
            {
                if (string.IsNullOrWhiteSpace(header))
                    continue;
                var key = ProductImportColumns.KeyFor(header);
                if (key is null)
                {
                    ignored.Add(header.Trim());
                    continue;
                }
                var value = rawValue?.Trim();
                // If two headers mean the same column, the first one with a value wins.
                if (!string.IsNullOrEmpty(value) && !cells.ContainsKey(key))
                    cells[key] = value;
            }

            if (cells.Count == 0)
                continue; // blank spreadsheet row

            var row = new ParsedRow { RowNumber = input.RowNumber, Index = rows.Count };
            ParseCells(row, cells, request.DefaultCategory, result);
            rows.Add(row);
        }

        result.IgnoredColumns = ignored.ToList();
        return rows;
    }

    private void ParseCells(ParsedRow row, Dictionary<string, string> cells, string? defaultCategory, ProductImportResult result)
    {
        string? Get(string key) => cells.TryGetValue(key, out var v) ? v : null;
        void Error(string message) => result.Errors.Add(new ProductImportIssue(row.RowNumber, message));

        string? Text(string key, string label, int max)
        {
            var value = Get(key);
            if (value is not null && value.Length > max)
            {
                Error($"{label} is too long ({value.Length} characters; the limit is {max}).");
                return null;
            }
            return value;
        }

        row.Name = Text(ProductImportColumns.ProductName, "Product name", 160) ?? string.Empty;
        if (Get(ProductImportColumns.ProductName) is null)
            Error("Product name is required.");

        var typeText = Get(ProductImportColumns.ProductType);
        if (typeText is not null)
        {
            var type = ProductImportColumns.Normalize(typeText) switch
            {
                "crochetessentials" or "essentials" or "resell" or "yarn" => (ProductType?)ProductType.Resell,
                "handmadecollection" or "handmade" or "collection" => ProductType.Handmade,
                _ => null
            };
            if (type is null)
                Error("Product type must be 'Crochet Essentials' or 'Handmade collection'.");
            else
                row.Type = type.Value;
        }

        row.Category = Text(ProductImportColumns.Category, "Category", 80);
        row.CategoryExplicit = row.Category is not null;
        if (row.Category is null && !string.IsNullOrWhiteSpace(defaultCategory))
            row.Category = defaultCategory.Trim();
        if (row.Category is { Length: > 80 })
        {
            Error("Category is too long (the limit is 80 characters).");
            row.Category = null;
        }

        row.Code = Text(ProductImportColumns.ProductCode, "Product code", 40) ?? string.Empty;
        if (Get(ProductImportColumns.ProductCode) is null)
            Error("Product code is required.");

        row.Shade = Text(ProductImportColumns.ShadeName, "Shade / colour name", 40);

        var swatch = Get(ProductImportColumns.SwatchColour);
        if (swatch is not null)
        {
            if (HexColour.IsMatch(swatch))
                row.Swatch = (swatch.StartsWith('#') ? swatch : "#" + swatch).ToUpperInvariant();
            else
                Error("Swatch colour must be a hex value like #C8A2C8.");
        }

        var priceText = Get(ProductImportColumns.Price);
        if (priceText is null)
            Error("Price is required.");
        else if (TryParseWholeNumber(priceText, "Price", out var price, out var priceError))
            row.Price = price;
        else
            Error(priceError!);

        var mrpText = Get(ProductImportColumns.Mrp);
        if (mrpText is not null)
        {
            if (TryParseWholeNumber(mrpText, "MRP", out var mrp, out var mrpError))
                row.Mrp = mrp;
            else
                Error(mrpError!);
        }

        var stockText = Get(ProductImportColumns.Stock);
        if (stockText is not null)
        {
            if (TryParseWholeNumber(stockText, "Stock", out var stock, out var stockError))
                row.Stock = stock;
            else
                Error(stockError!);
        }

        var sortText = Get(ProductImportColumns.SortOrder);
        if (sortText is not null)
        {
            if (TryParseWholeNumber(sortText, "Sort order", out var sort, out var sortError))
                row.SortOrder = sort;
            else
                Error(sortError!);
        }

        row.Description = Text(ProductImportColumns.Description, "Description", 2000);
        row.Spec1 = Text(ProductImportColumns.Spec1, "Spec 1", 120);
        row.Spec2 = Text(ProductImportColumns.Spec2, "Spec 2", 120);
        row.BallWeight = Text(ProductImportColumns.BallWeight, "Ball weight", 40);
        row.YarnLength = Text(ProductImportColumns.YarnLength, "Yarn length", 40);
        row.HookSize = Text(ProductImportColumns.CrochetHookSize, "Crochet hook size", 40);
        row.FibreBlend = Text(ProductImportColumns.FibreBlend, "Fibre / blend", 80);
        row.YarnWeight = Text(ProductImportColumns.YarnWeight, "Yarn weight", 40);
        row.NeedleSize = Text(ProductImportColumns.NeedleSize, "Needle size", 40);
        row.VariantLabel = Text(ProductImportColumns.VariantOptionLabel, "Variant option label", 40);
    }

    /// <summary>"₹130", "130.00" and "1,300" are fine; "130.50" and "abc" are not.</summary>
    private static bool TryParseWholeNumber(string text, string label, out int value, out string? error)
    {
        value = 0;
        error = null;
        var cleaned = Regex.Replace(text, @"(?i)(₹|rs\.?|inr|,|\s)", string.Empty);
        if (!decimal.TryParse(cleaned, NumberStyles.Number, CultureInfo.InvariantCulture, out var number))
        {
            error = $"{label} '{text}' is not a number.";
            return false;
        }
        if (number != decimal.Truncate(number))
        {
            error = $"{label} '{text}' must be a whole number.";
            return false;
        }
        if (number < 0 || number > int.MaxValue)
        {
            error = $"{label} '{text}' is out of range.";
            return false;
        }
        value = (int)number;
        return true;
    }

    // ------------------------------------------------------------- validation

    private void Validate(List<ParsedRow> rows, ProductImportResult result)
    {
        void Error(ParsedRow row, string message) => result.Errors.Add(new ProductImportIssue(row.RowNumber, message));

        var firstByCode = new Dictionary<string, ParsedRow>(StringComparer.OrdinalIgnoreCase);
        foreach (var row in rows.Where(r => r.Code.Length > 0))
        {
            if (firstByCode.TryGetValue(row.Code, out var first))
                Error(row, $"Product code {row.Code} is also used in row {first.RowNumber}. Each product needs its own code.");
            else
                firstByCode[row.Code] = row;
        }

        foreach (var row in rows)
        {
            if (row.Category is null && !result.Errors.Any(e => e.Row == row.RowNumber && e.Message.StartsWith("Category")))
                Error(row, "Category is required (or set a default category).");

            if (row.Type == ProductType.Handmade)
            {
                if (row.IsShade)
                    Error(row, "Shades are only available for Crochet Essentials. Leave 'Shade / colour name' empty for handmade products.");
                foreach (var (label, value) in new (string, string?)[]
                         {
                             ("Ball weight", row.BallWeight), ("Yarn length", row.YarnLength),
                             ("Crochet hook size", row.HookSize), ("Fibre / blend", row.FibreBlend),
                             ("Yarn weight", row.YarnWeight), ("Needle size", row.NeedleSize),
                             ("Swatch colour", row.Swatch)
                         })
                {
                    if (!string.IsNullOrEmpty(value))
                        result.Warnings.Add(new ProductImportIssue(row.RowNumber, $"{label} only applies to Crochet Essentials, so it was ignored."));
                }
            }

            if (row.Mrp is int mrp && mrp < row.Price)
                result.Warnings.Add(new ProductImportIssue(row.RowNumber, $"MRP ₹{mrp} is lower than the price ₹{row.Price}."));
        }

        foreach (var listing in rows.GroupBy(r => r.ListingKey))
        {
            var shadeRows = listing.Where(r => r.IsShade).ToList();
            if (shadeRows.Count == 0)
                continue;

            foreach (var plain in listing.Where(r => !r.IsShade))
                Error(plain, $"'{plain.Name}' has shades in other rows, so every row for it needs a shade name.");

            foreach (var duplicate in shadeRows
                         .GroupBy(r => r.Shade!, StringComparer.OrdinalIgnoreCase)
                         .Where(g => g.Count() > 1))
            {
                var rowNumbers = string.Join(", ", duplicate.Select(r => r.RowNumber));
                foreach (var row in duplicate.Skip(1))
                    Error(row, $"Shade '{duplicate.Key}' of '{row.Name}' appears more than once (rows {rowNumbers}).");
            }
        }
    }

    // --------------------------------------------------------- plan and apply

    private async Task PlanAndApplyAsync(
        List<ParsedRow> rows,
        bool dryRun,
        ProductImportResult result,
        CancellationToken cancellationToken)
    {
        var codesUpper = rows.Select(r => r.Code.ToUpperInvariant()).Distinct().ToList();
        var namesUpper = rows.Select(r => r.Name.ToUpperInvariant()).Distinct().ToList();

        var existingByCode = (await _db.Products
                .Include(p => p.Variants)
                .Where(p => p.ProductCode != null && codesUpper.Contains(p.ProductCode.ToUpper()))
                .ToListAsync(cancellationToken))
            .ToDictionary(p => p.ProductCode!.ToUpperInvariant());

        var candidateParents = await _db.Products
            .Where(p => p.ParentProductId == null && namesUpper.Contains(p.Name.ToUpper()))
            .Include(p => p.Variants)
            .ToListAsync(cancellationToken);

        var now = DateTime.UtcNow;
        var actions = new Dictionary<int, string>();

        foreach (var listing in rows.GroupBy(r => r.ListingKey))
        {
            var list = listing.OrderBy(r => r.Index).ToList();
            var first = list[0];

            if (!first.IsShade)
            {
                foreach (var row in list)
                    PlanSingleProduct(row, existingByCode, candidateParents, result, actions, now, dryRun);
                continue;
            }

            PlanListing(list, existingByCode, candidateParents, result, actions, now, dryRun);
        }

        if (result.Errors.Count > 0)
            return;

        foreach (var row in rows)
        {
            result.Rows.Add(new ProductImportRowResult
            {
                RowNumber = row.RowNumber,
                ProductCode = row.Code,
                Name = row.Name,
                Shade = row.Shade,
                Action = actions.GetValueOrDefault(row.RowNumber, "Create")
            });
            result.ProductCodes.Add(row.Code);
        }

        if (dryRun)
            return;

        await _db.SaveChangesAsync(cancellationToken);
        result.Applied = true;
    }

    private void PlanSingleProduct(
        ParsedRow row,
        Dictionary<string, Product> existingByCode,
        List<Product> candidateParents,
        ProductImportResult result,
        Dictionary<int, string> actions,
        DateTime now,
        bool dryRun)
    {
        if (existingByCode.TryGetValue(row.Code.ToUpperInvariant(), out var existing))
        {
            if (existing.ParentProductId is not null || existing.Variants.Count > 0 || existing.ProductType != row.Type)
            {
                result.Errors.Add(new ProductImportIssue(row.RowNumber,
                    $"Product code {row.Code} already belongs to '{existing.Name}', which is a different kind of product ({DescribeKind(existing)})."));
                return;
            }

            actions[row.RowNumber] = "Update";
            result.Summary.SingleProductsUpdated++;
            if (!dryRun)
                FillProduct(existing, row, now, forceName: true);
            return;
        }

        var sameName = candidateParents.FirstOrDefault(p => p.ProductType == row.Type && p.Variants.Count > 0
            && string.Equals(p.Name, row.Name, StringComparison.OrdinalIgnoreCase));
        if (sameName is not null)
        {
            result.Errors.Add(new ProductImportIssue(row.RowNumber,
                $"'{row.Name}' already exists as a listing with shades, so this row needs a shade name."));
            return;
        }

        actions[row.RowNumber] = "Create";
        result.Summary.SingleProductsCreated++;
        if (dryRun)
            return;

        var product = new Product { Id = Guid.NewGuid(), Status = ProductStatus.Draft, CreatedAt = now, ProductType = row.Type };
        FillProduct(product, row, now, forceName: true);
        _db.Products.Add(product);
    }

    private void PlanListing(
        List<ParsedRow> list,
        Dictionary<string, Product> existingByCode,
        List<Product> candidateParents,
        ProductImportResult result,
        Dictionary<int, string> actions,
        DateTime now,
        bool dryRun)
    {
        var first = list[0];

        var matches = candidateParents
            .Where(p => p.ProductType == first.Type
                        && string.Equals(p.Name, first.Name, StringComparison.OrdinalIgnoreCase))
            .ToList();
        if (matches.Count > 1)
        {
            result.Errors.Add(new ProductImportIssue(first.RowNumber,
                $"There is more than one listing named '{first.Name}' in the shop. Rename or remove the duplicate first."));
            return;
        }

        var parent = matches.FirstOrDefault();
        if (parent is not null && parent.Variants.Count == 0 && !string.IsNullOrEmpty(parent.ProductCode))
        {
            result.Errors.Add(new ProductImportIssue(first.RowNumber,
                $"'{first.Name}' already exists as a single product ({parent.ProductCode}), so it can't also have shades."));
            return;
        }

        // Listing-level values come from the first row that has them; flag rows that disagree.
        string? Shared(Func<ParsedRow, string?> pick, string label)
        {
            var values = list.Select(r => (Row: r, Value: pick(r))).Where(x => !string.IsNullOrEmpty(x.Value)).ToList();
            if (values.Count == 0)
                return null;
            var chosen = values[0];
            foreach (var other in values.Skip(1).Where(x => !string.Equals(x.Value, chosen.Value, StringComparison.Ordinal)))
                result.Warnings.Add(new ProductImportIssue(other.Row.RowNumber,
                    $"{label} differs from row {chosen.Row.RowNumber} for '{first.Name}'; using '{chosen.Value}' (row {chosen.Row.RowNumber})."));
            return chosen.Value;
        }

        var category = Shared(r => r.CategoryExplicit ? r.Category : null, "Category");
        var description = Shared(r => r.Description, "Description");
        var spec1 = Shared(r => r.Spec1, "Spec 1");
        var spec2 = Shared(r => r.Spec2, "Spec 2");
        var ballWeight = Shared(r => r.BallWeight, "Ball weight");
        var yarnLength = Shared(r => r.YarnLength, "Yarn length");
        var hook = Shared(r => r.HookSize, "Crochet hook size");
        var fibre = Shared(r => r.FibreBlend, "Fibre / blend");
        var yarnWeight = Shared(r => r.YarnWeight, "Yarn weight");
        var needle = Shared(r => r.NeedleSize, "Needle size");
        var label = Shared(r => r.VariantLabel, "Variant option label");

        var parentIsNew = parent is null;
        if (parentIsNew)
        {
            result.Summary.ListingsCreated++;
            if (!dryRun)
            {
                parent = new Product
                {
                    Id = Guid.NewGuid(),
                    Name = first.Name,
                    ProductType = first.Type,
                    Status = ProductStatus.Draft,
                    Price = 0,
                    AvailableStock = 0,
                    SortOrder = 0,
                    CreatedAt = now
                };
                _db.Products.Add(parent);
            }
        }
        else
        {
            result.Summary.ListingsUpdated++;
        }

        if (!dryRun)
        {
            parent!.Category = category
                ?? (string.IsNullOrEmpty(parent.Category) ? first.Category! : parent.Category);
            parent.Description = description ?? parent.Description;
            parent.Spec1 = spec1 ?? parent.Spec1;
            parent.Spec2 = spec2 ?? parent.Spec2;
            parent.BallWeight = ballWeight ?? parent.BallWeight;
            parent.YarnLength = yarnLength ?? parent.YarnLength;
            parent.CrochetHookSize = hook ?? parent.CrochetHookSize;
            parent.FibreBlend = fibre ?? parent.FibreBlend;
            parent.YarnWeight = yarnWeight ?? parent.YarnWeight;
            parent.NeedleSize = needle ?? parent.NeedleSize;
            parent.VariantOptionName = label ?? parent.VariantOptionName ?? "Colour";
            parent.UpdatedAt = now;
        }

        var nextSort = parent?.Variants.Select(v => v.SortOrder).DefaultIfEmpty(-1).Max() + 1 ?? 0;
        foreach (var row in list)
        {
            Product? variant = null;
            if (existingByCode.TryGetValue(row.Code.ToUpperInvariant(), out var byCode))
            {
                if (parent is null || byCode.ParentProductId != parent.Id)
                {
                    result.Errors.Add(new ProductImportIssue(row.RowNumber,
                        $"Product code {row.Code} already belongs to '{byCode.Name}' ({DescribeKind(byCode)}), not to this listing."));
                    continue;
                }
                variant = byCode;
            }
            else if (parent is not null)
            {
                // A shade added by hand earlier without a code: adopt it instead of duplicating it.
                variant = parent.Variants.FirstOrDefault(v =>
                    string.IsNullOrEmpty(v.ProductCode)
                    && string.Equals(v.ColourName, row.Shade, StringComparison.OrdinalIgnoreCase));
            }

            if (variant is not null)
            {
                actions[row.RowNumber] = "Update";
                result.Summary.ShadesUpdated++;
                if (!dryRun)
                    FillVariant(variant, parent!, row, now, sortFallback: null);
            }
            else
            {
                actions[row.RowNumber] = "Create";
                result.Summary.ShadesCreated++;
                if (!dryRun)
                {
                    var created = new Product
                    {
                        Id = Guid.NewGuid(),
                        Status = ProductStatus.Draft,
                        CreatedAt = now,
                        ProductType = first.Type,
                        AvailableStock = 0
                    };
                    FillVariant(created, parent!, row, now, sortFallback: nextSort++);
                    _db.Products.Add(created);
                }
            }
        }
    }

    private static void FillVariant(Product variant, Product parent, ParsedRow row, DateTime now, int? sortFallback)
    {
        // Same shape the admin form creates: the shade carries the listing's name, category and text.
        variant.Name = parent.Name;
        variant.Category = parent.Category;
        variant.Description = parent.Description;
        variant.ProductType = parent.ProductType;
        variant.ParentProductId = parent.Id;
        variant.ProductCode = row.Code;
        variant.ColourName = row.Shade;
        if (row.Swatch is not null)
            variant.ColourHex = row.Swatch;
        variant.Price = row.Price;
        if (row.Mrp.HasValue)
            variant.Mrp = row.Mrp;
        if (row.Stock.HasValue)
            variant.AvailableStock = row.Stock.Value;
        if (row.Spec1 is not null)
            variant.Spec1 = row.Spec1;
        if (row.Spec2 is not null)
            variant.Spec2 = row.Spec2;
        if (row.SortOrder.HasValue)
            variant.SortOrder = row.SortOrder.Value;
        else if (sortFallback.HasValue)
            variant.SortOrder = sortFallback.Value;
        variant.UpdatedAt = now;
    }

    private static void FillProduct(Product product, ParsedRow row, DateTime now, bool forceName)
    {
        var essentials = row.Type == ProductType.Resell;
        if (forceName)
            product.Name = row.Name;
        product.ProductCode = row.Code;
        product.Category = row.CategoryExplicit || string.IsNullOrEmpty(product.Category)
            ? row.Category!
            : product.Category;
        product.ProductType = row.Type;
        product.Description = row.Description ?? product.Description;
        product.Price = row.Price;
        if (row.Mrp.HasValue)
            product.Mrp = row.Mrp;
        if (row.Stock.HasValue)
            product.AvailableStock = row.Stock.Value;
        product.Spec1 = row.Spec1 ?? product.Spec1;
        product.Spec2 = row.Spec2 ?? product.Spec2;
        if (essentials)
        {
            product.BallWeight = row.BallWeight ?? product.BallWeight;
            product.YarnLength = row.YarnLength ?? product.YarnLength;
            product.CrochetHookSize = row.HookSize ?? product.CrochetHookSize;
            product.FibreBlend = row.FibreBlend ?? product.FibreBlend;
            product.YarnWeight = row.YarnWeight ?? product.YarnWeight;
            product.NeedleSize = row.NeedleSize ?? product.NeedleSize;
        }
        if (row.SortOrder.HasValue)
            product.SortOrder = row.SortOrder.Value;
        product.UpdatedAt = now;
    }

    private static string DescribeKind(Product product) =>
        product.ParentProductId is not null ? "a shade of another listing"
        : product.Variants.Count > 0 ? "a listing with shades"
        : "a single product";

    // ---------------------------------------------------------------- publish

    /// <summary>
    /// Publishes the given products that already have a photo, plus the listings those shades belong to.
    /// Products without a photo stay Draft and are reported so they can be finished.
    /// </summary>
    public async Task<ProductPublishResult> PublishWithPhotosAsync(
        IReadOnlyCollection<string> productCodes,
        CancellationToken cancellationToken)
    {
        var result = new ProductPublishResult();
        var codes = productCodes
            .Where(c => !string.IsNullOrWhiteSpace(c))
            .Select(c => c.Trim().ToUpperInvariant())
            .Distinct()
            .ToList();
        if (codes.Count == 0)
            return result;

        var products = await _db.Products
            .Include(p => p.Images)
            .Where(p => p.ProductCode != null && codes.Contains(p.ProductCode.ToUpper()))
            .ToListAsync(cancellationToken);

        foreach (var code in codes.Where(c => products.All(p => p.ProductCode!.ToUpperInvariant() != c)))
            result.NotFound.Add(code);

        var now = DateTime.UtcNow;
        var parentIds = new HashSet<Guid>();
        foreach (var product in products)
        {
            var hasPhoto = product.Images.Count > 0 || !string.IsNullOrWhiteSpace(product.ImageUrl);
            if (!hasPhoto)
            {
                result.SkippedNoPhoto.Add(product.ProductCode!);
                continue;
            }

            if (product.Status == ProductStatus.Published)
                result.AlreadyPublished++;
            else
            {
                product.Status = ProductStatus.Published;
                product.UpdatedAt = now;
                result.Published++;
            }

            if (product.ParentProductId is Guid parentId)
                parentIds.Add(parentId);
        }

        if (parentIds.Count > 0)
        {
            var parents = await _db.Products
                .Where(p => parentIds.Contains(p.Id) && p.Status != ProductStatus.Published)
                .ToListAsync(cancellationToken);
            foreach (var parent in parents)
            {
                parent.Status = ProductStatus.Published;
                parent.UpdatedAt = now;
                result.ListingsPublished++;
            }
        }

        await _db.SaveChangesAsync(cancellationToken);
        return result;
    }

    // ---------------------------------------------------------------- delete drafts

    /// <summary>
    /// Draft products that can be deleted: every Draft product except a listing that still has a
    /// published shade (deleting that listing would orphan the shade).
    /// </summary>
    private async Task<List<Product>> FindDeletableDraftsAsync(CancellationToken cancellationToken)
    {
        var drafts = await _db.Products
            .Include(p => p.Images)
            .Where(p => p.Status == ProductStatus.Draft)
            .ToListAsync(cancellationToken);

        var parentsWithKeptShades = await _db.Products
            .Where(p => p.ParentProductId != null && p.Status != ProductStatus.Draft)
            .Select(p => p.ParentProductId!.Value)
            .Distinct()
            .ToListAsync(cancellationToken);
        var keep = parentsWithKeptShades.ToHashSet();

        return drafts.Where(p => !keep.Contains(p.Id)).ToList();
    }

    public async Task<ProductDraftCount> CountDraftsAsync(CancellationToken cancellationToken)
    {
        var drafts = await FindDeletableDraftsAsync(cancellationToken);
        return new ProductDraftCount
        {
            Total = drafts.Count,
            Listings = drafts.Count(p => drafts.Any(d => d.ParentProductId == p.Id)),
        };
    }

    /// <summary>
    /// Deletes every draft product (shades first, then their listings). Published products are never
    /// touched. Order lines keep their history (the product link is cleared), as with a single delete.
    /// Returns the image blob paths so the caller can remove the files.
    /// </summary>
    public async Task<ProductDraftDeleteResult> DeleteDraftsAsync(CancellationToken cancellationToken)
    {
        var drafts = await FindDeletableDraftsAsync(cancellationToken);
        var result = new ProductDraftDeleteResult { Deleted = drafts.Count };
        if (drafts.Count == 0)
            return result;

        var ids = drafts.Select(p => p.Id).ToList();

        result.BlobPaths = drafts
            .SelectMany(p => p.Images.Select(i => i.BlobPath)
                .Concat(string.IsNullOrWhiteSpace(p.ImageUrl) ? [] : [p.ImageUrl!]))
            .Where(path => !string.IsNullOrWhiteSpace(path))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var orderItems = await _db.OrderItems
            .Where(i => i.ProductId != null && ids.Contains(i.ProductId.Value))
            .ToListAsync(cancellationToken);
        foreach (var item in orderItems)
            item.ProductId = null;

        var links = await _db.ProductEssentialLinks
            .Where(l => ids.Contains(l.SourceProductId) || ids.Contains(l.EssentialProductId))
            .ToListAsync(cancellationToken);
        _db.ProductEssentialLinks.RemoveRange(links);

        // Shades go first so a listing is never deleted while one of its shades still exists.
        var shades = drafts.Where(p => p.ParentProductId != null).ToList();
        _db.Products.RemoveRange(shades);
        await _db.SaveChangesAsync(cancellationToken);

        _db.Products.RemoveRange(drafts.Where(p => p.ParentProductId == null));
        await _db.SaveChangesAsync(cancellationToken);

        return result;
    }
}

public sealed class ProductDraftCount
{
    /// <summary>Draft products that would be deleted (listings and shades both count).</summary>
    public int Total { get; set; }
    /// <summary>How many of those are listings that have shades.</summary>
    public int Listings { get; set; }
}

public sealed class ProductDraftDeleteResult
{
    public int Deleted { get; set; }
    public List<string> BlobPaths { get; set; } = new();
}
