import { apiRequest } from './client';
import type { ProductType, ShopSlot } from '../types';

/**
 * Curated shop slots for a room. Slots are an optional layer over the category catalog,
 * so any failure resolves to "no slots" and the shop falls back to the flat product grid.
 */
export async function listShopSlots(productType: ProductType): Promise<ShopSlot[]> {
  try {
    const slots = await apiRequest<ShopSlot[]>(`/api/shop/slots?productType=${productType}`, {}, false);
    return slots.filter((s) => s.products.length > 0);
  } catch {
    return [];
  }
}
