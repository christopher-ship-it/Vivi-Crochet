import { apiRequest } from './client';

export interface ShopSettings {
  handmadeEnabled: boolean;
}

/** Public: whether the Handmade Collection is switched on in the admin dashboard. */
export async function getShopSettings(): Promise<ShopSettings> {
  return apiRequest<ShopSettings>('/api/shop-settings', {}, false);
}
