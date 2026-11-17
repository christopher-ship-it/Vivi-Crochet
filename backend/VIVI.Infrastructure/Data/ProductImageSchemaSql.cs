namespace VIVI.Infrastructure.Data;

/// <summary>DDL for the product thumbnail column, shared by the migration and the startup check.</summary>
public static class ProductImageSchemaSql
{
    public const string AddThumbBlobPath = """
        IF COL_LENGTH(N'ProductImages', N'ThumbBlobPath') IS NULL
            ALTER TABLE [ProductImages] ADD [ThumbBlobPath] nvarchar(512) NULL;
        """;
}
