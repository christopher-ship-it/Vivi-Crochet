import AsyncStorage from '@react-native-async-storage/async-storage';

const WISHLIST_STORAGE_KEY = 'vivi_wishlist_v1';

export interface WishlistState {
  productIds: string[];
  updatedAt: string;
}

export async function loadWishlistFromStorage(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(WISHLIST_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WishlistState;
    if (!Array.isArray(parsed.productIds)) return [];
    return parsed.productIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
  } catch {
    throw new Error('Could not load your wishlist. Try again.');
  }
}

export async function saveWishlistToStorage(productIds: string[]): Promise<void> {
  try {
    const payload: WishlistState = {
      productIds,
      updatedAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    throw new Error('Could not save your wishlist. Check device storage and try again.');
  }
}
