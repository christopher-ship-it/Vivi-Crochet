namespace VIVI.Infrastructure.Data;

/// <summary>DDL for the ShopSettings table, shared by the migration and the startup bootstrapper.</summary>
public static class ShopSettingsSchemaSql
{
    public const string CreateTable = """
        IF OBJECT_ID(N'[ShopSettings]', N'U') IS NULL
        BEGIN
            CREATE TABLE [ShopSettings] (
                [Id] uniqueidentifier NOT NULL,
                [HandmadeEnabled] bit NOT NULL,
                [UpdatedAt] datetime2 NOT NULL,
                CONSTRAINT [PK_ShopSettings] PRIMARY KEY ([Id])
            );
        END
        """;

    public const string AddDeliveryNotice = """
        IF COL_LENGTH(N'ShopSettings', N'DeliveryNotice') IS NULL
            ALTER TABLE [ShopSettings] ADD [DeliveryNotice] nvarchar(500) NULL;
        """;
}
