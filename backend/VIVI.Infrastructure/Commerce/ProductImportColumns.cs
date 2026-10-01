namespace VIVI.Infrastructure.Commerce;

/// <summary>One column of the product upload sheet. This list is the single source of truth: the sample file
/// the admin downloads and the header matching in <see cref="ProductImportService"/> both come from it.</summary>
public sealed record ProductImportColumn(
    string Key,
    string Header,
    bool Required,
    string Help,
    string Example,
    string[] Aliases);

public static class ProductImportColumns
{
    public const string ProductName = "ProductName";
    public const string ProductType = "ProductType";
    public const string Category = "Category";
    public const string ProductCode = "ProductCode";
    public const string ShadeName = "ShadeName";
    public const string SwatchColour = "SwatchColour";
    public const string Price = "Price";
    public const string Mrp = "Mrp";
    public const string Stock = "Stock";
    public const string Description = "Description";
    public const string Spec1 = "Spec1";
    public const string Spec2 = "Spec2";
    public const string BallWeight = "BallWeight";
    public const string YarnLength = "YarnLength";
    public const string CrochetHookSize = "CrochetHookSize";
    public const string FibreBlend = "FibreBlend";
    public const string YarnWeight = "YarnWeight";
    public const string NeedleSize = "NeedleSize";
    public const string VariantOptionLabel = "VariantOptionLabel";
    public const string SortOrder = "SortOrder";
    public const string ImageFilename = "ImageFilename";

    /// <summary>Headers that are understood but intentionally not imported (kept in sheets people already have).</summary>
    public static readonly string[] IgnoredHeaders = ["Display Name", "Source URL"];

    /// <summary>Header names match the labels in the admin product form.</summary>
    public static readonly IReadOnlyList<ProductImportColumn> All =
    [
        new(ProductName, "Product name", true,
            "Name of the product listing. Rows with the same product name and a shade name become the shades of one listing.",
            "Desire Knitting Yarn", ["Product", "Name", "Listing name", "Product title"]),
        new(ProductType, "Product type", false,
            "Crochet Essentials (the default when empty) or Handmade collection.",
            "Crochet Essentials", ["Type", "Shop room"]),
        new(Category, "Category", false,
            "Shop category. Required unless you set a default category when uploading.",
            "Yarn", ["Product category"]),
        new(ProductCode, "Product code", true,
            "Unique code (SKU). Every shade needs its own code. It is how an upload finds the product again, and how photos are matched.",
            "DSR001", ["Shade Code", "SKU", "Code", "Item code"]),
        new(ShadeName, "Shade / colour name", false,
            "Fill in for a shade of a listing. Leave empty for a single product that has no shades.",
            "Lilac", ["Shade Name", "Colour name", "Color name", "Colour", "Color", "Shade"]),
        new(SwatchColour, "Swatch colour", false,
            "Colour chip shown in the app, as #RRGGBB.",
            "#C8A2C8", ["Colour hex", "Color hex", "Swatch", "Hex"]),
        new(Price, "Price", true,
            "Selling price in whole rupees.",
            "130", ["Price (INR)", "Price INR", "Selling price", "Rate"]),
        new(Mrp, "MRP", false,
            "Maximum retail price in whole rupees (shown struck through).",
            "150", ["Maximum retail price"]),
        new(Stock, "Stock", false,
            "Units available to sell. Empty keeps the current stock (new products start at 0, which shows as sold out).",
            "50", ["Available stock", "Quantity", "Qty", "Inventory"]),
        new(Description, "Description", false,
            "Text shown on the product page. For a listing with shades, the first row that has one is used.",
            "Soft, durable acrylic yarn for knitting and crochet.", ["Details"]),
        new(Spec1, "Spec 1", false, "Free-text specification.", "", ["Specification 1"]),
        new(Spec2, "Spec 2", false, "Free-text specification.", "", ["Specification 2"]),
        new(BallWeight, "Ball weight", false, "Crochet Essentials only.", "100 g", ["Weight per ball"]),
        new(YarnLength, "Yarn length", false, "Crochet Essentials only.", "200 m", ["Length"]),
        new(CrochetHookSize, "Crochet hook size", false, "Crochet Essentials only.", "UK 3 (6.5 mm)", ["Hook size"]),
        new(FibreBlend, "Fibre / blend", false, "Crochet Essentials only.", "100% Acrylic", ["Fibre / Blend", "Fiber", "Blend", "Composition"]),
        new(YarnWeight, "Yarn weight", false, "Crochet Essentials only.", "4 Medium", ["Yarn Weight", "Ply"]),
        new(NeedleSize, "Needle size", false, "Crochet Essentials only.", "UK 5 (5.5 mm)", ["Needle Size", "Knitting needle size"]),
        new(VariantOptionLabel, "Variant option label", false,
            "What the shade picker is called in the app. Empty keeps the current label (new listings use Colour).",
            "Shade", ["Option label", "Variant label"]),
        new(SortOrder, "Sort order", false, "Lower numbers appear first. Empty keeps the current order.", "", ["Order", "Position"]),
        new(ImageFilename, "Image filename", false,
            "For your own reference. Photos are matched to products by file name in the photos step (the file name must start with the product code).",
            "DSR001_Lilac.jpg", ["Image", "Photo", "Photo filename"]),
    ];

    /// <summary>Lower-case letters and digits only, so "Price (INR)" and "price inr" compare equal.</summary>
    public static string Normalize(string? header)
    {
        if (string.IsNullOrEmpty(header))
            return string.Empty;
        return new string(header.Where(char.IsLetterOrDigit).Select(char.ToLowerInvariant).ToArray());
    }

    private static readonly Lazy<Dictionary<string, string>> HeaderLookup = new(() =>
    {
        var map = new Dictionary<string, string>();
        foreach (var column in All)
        {
            map[Normalize(column.Header)] = column.Key;
            foreach (var alias in column.Aliases)
                map.TryAdd(Normalize(alias), column.Key);
        }
        return map;
    });

    private static readonly Lazy<HashSet<string>> IgnoredLookup =
        new(() => IgnoredHeaders.Select(Normalize).ToHashSet());

    /// <summary>The column key a sheet header refers to, or null when it is not a known column.</summary>
    public static string? KeyFor(string? header) =>
        HeaderLookup.Value.TryGetValue(Normalize(header), out var key) ? key : null;

    public static bool IsIgnoredHeader(string? header) => IgnoredLookup.Value.Contains(Normalize(header));
}
