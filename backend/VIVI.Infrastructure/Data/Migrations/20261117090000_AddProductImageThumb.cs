using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VIVI.Infrastructure.Data;

#nullable disable

namespace VIVI.Infrastructure.Data.Migrations;

/// <summary>Small (~400 px) copy of each product photo for lists and cards. Idempotent.</summary>
[DbContext(typeof(ViviDbContext))]
[Migration("20261117090000_AddProductImageThumb")]
public sealed class AddProductImageThumb : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
        => migrationBuilder.Sql(ProductImageSchemaSql.AddThumbBlobPath);

    protected override void Down(MigrationBuilder migrationBuilder)
        => migrationBuilder.Sql("IF COL_LENGTH(N'ProductImages', N'ThumbBlobPath') IS NOT NULL ALTER TABLE [ProductImages] DROP COLUMN [ThumbBlobPath];");
}
