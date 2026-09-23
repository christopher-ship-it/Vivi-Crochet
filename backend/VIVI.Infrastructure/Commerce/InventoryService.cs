using Microsoft.EntityFrameworkCore;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Infrastructure.Data;

namespace VIVI.Infrastructure.Commerce;

/// <summary>
/// Stock is validated at checkout and deducted exactly once on successful payment
/// fulfillment using an atomic conditional UPDATE (or tracked update under InMemory tests).
/// Failed/abandoned payments never deduct. No temporary reservation layer.
/// </summary>
public sealed class InventoryService
{
    private readonly ViviDbContext _db;

    public InventoryService(ViviDbContext db) => _db = db;

    public void EnsureAvailableOrThrow(Product product, int quantity)
    {
        if (quantity < 1)
            throw ViviException.Conflict("INVALID_QUANTITY", "Product quantity must be at least 1.");

        if (product.AvailableStock <= 0)
            throw ViviException.InsufficientStock(0);

        if (quantity > product.AvailableStock)
            throw ViviException.InsufficientStock(product.AvailableStock);
    }

    public async Task DeductForOrderAsync(Order order, CancellationToken cancellationToken)
    {
        if (order.InventoryDeducted)
            return;

        var lines = order.Items
            .Where(i => i.ItemType == OrderItemType.Product && i.ProductId.HasValue && i.Quantity > 0)
            .GroupBy(i => i.ProductId!.Value)
            .Select(g => new { ProductId = g.Key, Quantity = g.Sum(i => i.Quantity) })
            .ToList();

        foreach (var line in lines)
            await DeductAsync(line.ProductId, line.Quantity, cancellationToken);

        order.InventoryDeducted = true;
    }

    public async Task DeductAsync(Guid productId, int quantity, CancellationToken cancellationToken)
    {
        if (quantity < 1)
            return;

        if (_db.Database.IsRelational())
        {
            var now = DateTime.UtcNow;
            var rows = await _db.Database.ExecuteSqlInterpolatedAsync(
                $"""
                 UPDATE Products
                 SET AvailableStock = AvailableStock - {quantity}, UpdatedAt = {now}
                 WHERE Id = {productId} AND AvailableStock >= {quantity}
                 """,
                cancellationToken);

            if (rows == 0)
            {
                var available = await _db.Products.AsNoTracking()
                    .Where(p => p.Id == productId)
                    .Select(p => (int?)p.AvailableStock)
                    .FirstOrDefaultAsync(cancellationToken) ?? 0;
                throw ViviException.InsufficientStock(available);
            }

            return;
        }

        var product = await _db.Products.SingleOrDefaultAsync(p => p.Id == productId, cancellationToken)
            ?? throw ViviException.NotFound("PRODUCT_NOT_FOUND", "Product was not found.");

        EnsureAvailableOrThrow(product, quantity);
        product.AvailableStock -= quantity;
        product.UpdatedAt = DateTime.UtcNow;
    }

    public async Task RestoreForOrderAsync(Order order, CancellationToken cancellationToken)
    {
        if (!order.InventoryDeducted)
            return;

        var lines = order.Items
            .Where(i => i.ItemType == OrderItemType.Product && i.ProductId.HasValue && i.Quantity > 0)
            .GroupBy(i => i.ProductId!.Value)
            .Select(g => new { ProductId = g.Key, Quantity = g.Sum(i => i.Quantity) })
            .ToList();

        foreach (var line in lines)
            await RestoreAsync(line.ProductId, line.Quantity, cancellationToken);

        order.InventoryDeducted = false;
    }

    public async Task RestoreAsync(Guid productId, int quantity, CancellationToken cancellationToken)
    {
        if (quantity < 1)
            return;

        if (_db.Database.IsRelational())
        {
            var now = DateTime.UtcNow;
            await _db.Database.ExecuteSqlInterpolatedAsync(
                $"""
                 UPDATE Products
                 SET AvailableStock = AvailableStock + {quantity}, UpdatedAt = {now}
                 WHERE Id = {productId}
                 """,
                cancellationToken);
            return;
        }

        var product = await _db.Products.SingleOrDefaultAsync(p => p.Id == productId, cancellationToken);
        if (product is null)
            return;

        product.AvailableStock += quantity;
        product.UpdatedAt = DateTime.UtcNow;
    }
}
