import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CartLineItem, CartState } from './types';

const CART_STORAGE_KEY = 'vivi_shopping_cart_v1';

export async function loadCartFromStorage(): Promise<CartLineItem[]> {
  try {
    const raw = await AsyncStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CartState;
    if (!Array.isArray(parsed.items)) return [];
    return parsed.items.filter(isValidLineItem);
  } catch {
    throw new Error('Could not load your cart. Try again.');
  }
}

export async function saveCartToStorage(items: CartLineItem[]): Promise<void> {
  try {
    const payload: CartState = {
      items,
      updatedAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(CART_STORAGE_KEY, JSON.stringify(payload));
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
