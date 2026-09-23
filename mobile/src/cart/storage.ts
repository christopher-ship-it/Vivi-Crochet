import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CartLineItem, CartState } from './types';

/** Pre–per-user key; claimed once by the next signed-in account. */
const LEGACY_CART_STORAGE_KEY = 'vivi_shopping_cart_v1';
const CART_STORAGE_PREFIX = 'vivi_shopping_cart_v1';

/** Guest (signed-out) carts stay separate from every customer cart. */
export const CART_GUEST_OWNER = 'guest';

export function cartStorageKey(ownerId: string): string {
  if (ownerId === CART_GUEST_OWNER) {
    return `${CART_STORAGE_PREFIX}:guest`;
  }
  return `${CART_STORAGE_PREFIX}:user:${ownerId}`;
}

function parseCartRaw(raw: string): CartLineItem[] {
  const parsed = JSON.parse(raw) as CartState;
  if (!Array.isArray(parsed.items)) return [];
  return parsed.items.filter(isValidLineItem);
}

export async function loadCartFromStorage(ownerId: string): Promise<CartLineItem[]> {
  try {
    const key = cartStorageKey(ownerId);
    const raw = await AsyncStorage.getItem(key);
    if (raw) return parseCartRaw(raw);

    // One-time: move the old device-wide cart into this signed-in user's bucket.
    // Guest never inherits it — otherwise logout→other login would leak items.
    if (ownerId !== CART_GUEST_OWNER) {
      const legacy = await AsyncStorage.getItem(LEGACY_CART_STORAGE_KEY);
      if (legacy) {
        await AsyncStorage.setItem(key, legacy);
        await AsyncStorage.removeItem(LEGACY_CART_STORAGE_KEY);
        return parseCartRaw(legacy);
      }
    }

    return [];
  } catch {
    throw new Error('Could not load your cart. Try again.');
  }
}

export async function saveCartToStorage(ownerId: string, items: CartLineItem[]): Promise<void> {
  try {
    const payload: CartState = {
      items,
      updatedAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(cartStorageKey(ownerId), JSON.stringify(payload));
  } catch {
    throw new Error('Could not save your cart. Check device storage and try again.');
  }
}

function isValidLineItem(item: unknown): item is CartLineItem {
  if (!item || typeof item !== 'object') return false;
  const row = item as CartLineItem;
  return (
    typeof row.productId === 'string'
    && typeof row.quantity === 'number'
    && row.quantity >= 1
    && typeof row.name === 'string'
    && typeof row.price === 'number'
    && row.price >= 0
  );
}
