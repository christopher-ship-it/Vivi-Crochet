import { clampQuantity, MIN_CART_QUANTITY } from './calculations';

export function clampQuantityToStock(quantity: number, availableStock: number): number {
  if (availableStock <= 0) return 0;
  const capped = Math.min(quantity, availableStock);
  return Math.max(MIN_CART_QUANTITY, capped);
}

export function canIncreaseQuantity(quantity: number, availableStock: number): boolean {
  return availableStock > 0 && quantity < availableStock;
}

export function isOutOfStock(availableStock: number): boolean {
  return availableStock <= 0;
}

/** Re-clamp a cart line after refreshing live stock from the API. */
export function applyLiveStockToCartQuantity(
  quantity: number,
  availableStock: number,
): { quantity: number; reduced: boolean; message: string | null } {
  if (availableStock <= 0) {
    return {
      quantity: 0,
      reduced: true,
      message: 'This product is out of stock.',
    };
  }

  if (quantity > availableStock) {
    return {
      quantity: availableStock,
      reduced: true,
      message: `Only ${availableStock} available.`,
    };
  }

  return { quantity: clampQuantity(quantity), reduced: false, message: null };
}
