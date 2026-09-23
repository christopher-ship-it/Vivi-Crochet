/** Snapshot stored with each cart line — prices refreshed from API when possible. */
export interface CartLineItem {
  productId: string;
  quantity: number;
  name: string;
  price: number;
  imageUrl?: string | null;
  category?: string;
  availableStock?: number;
  /** Handmade vs Resell — Resell (essentials) use a compact cart row. */
  productType?: 'Handmade' | 'Resell';
}

export interface CartState {
  items: CartLineItem[];
  updatedAt: string;
}
