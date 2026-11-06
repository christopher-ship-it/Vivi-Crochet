import { apiRequest } from './client';

export interface ShopSettings {
  handmadeEnabled: boolean;
  deliveryNotice: string | null;
}

export async function getShopSettings(): Promise<ShopSettings> {
  return apiRequest<ShopSettings>('/api/shop-settings');
}

export async function setHandmadeEnabled(handmadeEnabled: boolean): Promise<ShopSettings> {
  return apiRequest<ShopSettings>('/api/admin/shop-settings', {
    method: 'PUT',
    body: JSON.stringify({ handmadeEnabled }),
  });
}

/** Empty text clears the notice. */
export async function setDeliveryNotice(deliveryNotice: string): Promise<ShopSettings> {
  return apiRequest<ShopSettings>('/api/admin/shop-settings', {
    method: 'PUT',
    body: JSON.stringify({ deliveryNotice }),
  });
}
