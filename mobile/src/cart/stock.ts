import { clampQuantity, MIN_CART_QUANTITY } from './calculations';

export function clampQuantityToStock(quantity: number, availableStock: number): number {
  if (availableStock <= 0) return 0;
  if (quantity <= 0) return 0;
  return Math.min(quantity, availableStock);
}

export const YARN_MAX_QUANTITY = 10;
export const YARN_LIMIT_MESSAGE = 'You can select only a maximum of 10 pieces per order.';

export function isYarnCategory(category: string | undefined): boolean {
  return category?.trim().toLowerCase() === 'yarn';
}

/**
 * Yarn is capped per order, counted across every yarn shade and product in the cart;
 * other categories are limited by stock only. `otherYarn` is the yarn already in the cart
 * on lines other than the one being changed.
 */
export function exceedsYarnLimit(
  otherYarn: number,
  category: string | undefined,
  quantity: number,
): boolean {
  return isYarnCategory(category) && otherYarn + quantity > YARN_MAX_QUANTITY;
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
