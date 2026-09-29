import { apiRequest } from './client';
import type { ProductType, ShopSlot, ShopSlotRequest } from '../types';

export async function listShopSlots(productType?: ProductType): Promise<ShopSlot[]> {
  const qs = productType ? `?productType=${productType}` : '';
  return apiRequest<ShopSlot[]>(`/api/admin/shop/slots${qs}`);
}

export async function getShopSlot(id: string): Promise<ShopSlot> {
  return apiRequest<ShopSlot>(`/api/admin/shop/slots/${id}`);
}

export async function createShopSlot(data: ShopSlotRequest): Promise<ShopSlot> {
  return apiRequest<ShopSlot>('/api/admin/shop/slots', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateShopSlot(id: string, data: ShopSlotRequest): Promise<ShopSlot> {
  return apiRequest<ShopSlot>(`/api/admin/shop/slots/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteShopSlot(id: string): Promise<void> {
  return apiRequest<void>(`/api/admin/shop/slots/${id}`, { method: 'DELETE' });
}

/** Replaces the slot's complete ordered product list. */
export async function replaceShopSlotProducts(id: string, productIds: string[]): Promise<ShopSlot> {
  return apiRequest<ShopSlot>(`/api/admin/shop/slots/${id}/products`, {
    method: 'PUT',
    body: JSON.stringify({ productIds }),
  });
}
