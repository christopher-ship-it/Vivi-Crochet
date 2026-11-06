import { apiRequest } from './client';

export interface ShopSettings {
  handmadeEnabled: boolean;
  /** Admin-written checkout notice (e.g. courier delays); empty/null = none. */
  deliveryNotice?: string | null;
}

/** Public: whether the Handmade Collection is switched on in the admin dashboard. */
export async function getShopSettings(): Promise<ShopSettings> {
  return apiRequest<ShopSettings>('/api/shop-settings', {}, false);
}
