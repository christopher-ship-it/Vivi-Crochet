import AsyncStorage from '@react-native-async-storage/async-storage';

/** Pre–per-user key; claimed once by the next signed-in account. */
const LEGACY_WISHLIST_STORAGE_KEY = 'vivi_wishlist_v1';
const WISHLIST_STORAGE_PREFIX = 'vivi_wishlist_v1';

export const WISHLIST_GUEST_OWNER = 'guest';

export interface WishlistState {
  productIds: string[];
  updatedAt: string;
}

export function wishlistStorageKey(ownerId: string): string {
  if (ownerId === WISHLIST_GUEST_OWNER) {
    return `${WISHLIST_STORAGE_PREFIX}:guest`;
  }
  return `${WISHLIST_STORAGE_PREFIX}:user:${ownerId}`;
}

function parseWishlistRaw(raw: string): string[] {
  const parsed = JSON.parse(raw) as WishlistState;
  if (!Array.isArray(parsed.productIds)) return [];
  return parsed.productIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

export async function loadWishlistFromStorage(ownerId: string): Promise<string[]> {
  try {
    const key = wishlistStorageKey(ownerId);
    const raw = await AsyncStorage.getItem(key);
    if (raw) return parseWishlistRaw(raw);

    // One-time: claim the old device-wide wishlist for this signed-in user only.
    if (ownerId !== WISHLIST_GUEST_OWNER) {
      const legacy = await AsyncStorage.getItem(LEGACY_WISHLIST_STORAGE_KEY);
      if (legacy) {
        await AsyncStorage.setItem(key, legacy);
        await AsyncStorage.removeItem(LEGACY_WISHLIST_STORAGE_KEY);
        return parseWishlistRaw(legacy);
      }
    }

    return [];
  } catch {
    throw new Error('Could not load your wishlist. Try again.');
  }
}

export async function saveWishlistToStorage(ownerId: string, productIds: string[]): Promise<void> {
  try {
    const payload: WishlistState = {
      productIds,
      updatedAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(wishlistStorageKey(ownerId), JSON.stringify(payload));
  } catch {
    throw new Error('Could not save your wishlist. Check device storage and try again.');
  }
}
