import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  applyLiveStockToCartQuantity,
  canIncreaseQuantity,
  clampQuantityToStock,
  isOutOfStock,
} from './stock.ts';

describe('cart stock helpers', () => {
  test('stock 10 allows quantity 10 but not 11', () => {
    assert.equal(clampQuantityToStock(10, 10), 10);
    assert.equal(clampQuantityToStock(11, 10), 10);
    assert.equal(canIncreaseQuantity(10, 10), false);
    assert.equal(canIncreaseQuantity(9, 10), true);
  });

  test('stock 1 disables increase at 1', () => {
    assert.equal(canIncreaseQuantity(1, 1), false);
  });

  test('stock 0 is out of stock', () => {
    assert.equal(isOutOfStock(0), true);
    assert.equal(clampQuantityToStock(1, 0), 0);
  });

  test('cart refresh reduces quantity when stock drops', () => {
    const result = applyLiveStockToCartQuantity(5, 3);
    assert.equal(result.quantity, 3);
    assert.equal(result.reduced, true);
    assert.equal(result.message, 'Only 3 available.');
  });
});
