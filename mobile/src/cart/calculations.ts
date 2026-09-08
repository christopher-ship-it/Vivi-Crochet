import type { CartLineItem } from './types';

export const MIN_CART_QUANTITY = 1;

export function lineTotal(item: CartLineItem): number {
  return item.price * item.quantity;
}

export function cartSubtotal(items: CartLineItem[]): number {
  return items.reduce((sum, item) => sum + lineTotal(item), 0);
}

export function cartItemCount(items: CartLineItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

export function clampQuantity(quantity: number): number {
  return Math.max(MIN_CART_QUANTITY, quantity);
}
