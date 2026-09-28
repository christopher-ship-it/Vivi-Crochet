import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  cartLineKey,
  isCourseLine,
  isProductLine,
  normalizeCartItemType,
  type CartLineItem,
  type CartState,
} from './types';

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
  return parsed.items.filter(isValidLineItem).map(normalizeStoredLine);
}

function normalizeStoredLine(item: CartLineItem): CartLineItem {
  if (isCourseLine(item)) {
    return {
      ...item,
      itemType: item.itemType === 'CourseBundle' ? 'CourseBundle' : 'Course',
      quantity: 1,
      productId: undefined,
    };
  }
  return {
    ...item,
    itemType: 'Product',
    courseId: undefined,
  };
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

/**
 * On sign-in, fold the guest cart into the customer's cart so items added
 * before logging in (e.g. Buy now → sign in) are not lost. Guest bucket is
 * emptied afterwards; the reverse direction (logout) never inherits.
 */
export async function claimGuestCart(
  ownerId: string,
  userItems: CartLineItem[],
): Promise<CartLineItem[]> {
  if (ownerId === CART_GUEST_OWNER) return userItems;
  const guestKey = cartStorageKey(CART_GUEST_OWNER);
  try {
    const raw = await AsyncStorage.getItem(guestKey);
    if (!raw) return userItems;
    const guestItems = parseCartRaw(raw);
    if (guestItems.length === 0) {
      await AsyncStorage.removeItem(guestKey);
      return userItems;
    }
    const merged = [...userItems];
    for (const g of guestItems) {
      const key = cartLineKey(g);
      const i = merged.findIndex((m) => cartLineKey(m) === key);
      if (i === -1) {
        merged.push(g);
      } else if (isProductLine(g)) {
        const stock = g.availableStock ?? merged[i].availableStock;
        const sum = merged[i].quantity + g.quantity;
        merged[i] = {
          ...g,
          quantity: typeof stock === 'number' && stock > 0 ? Math.min(sum, stock) : sum,
        };
      } else {
        merged[i] = { ...g, quantity: 1 };
      }
    }
    await saveCartToStorage(ownerId, merged);
    await AsyncStorage.removeItem(guestKey);
    return merged;
  } catch {
    return userItems;
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
  if (
    typeof row.quantity !== 'number'
    || row.quantity < 1
    || typeof row.name !== 'string'
    || typeof row.price !== 'number'
    || row.price < 0
  ) {
    return false;
  }

  const type = normalizeCartItemType(row);
  if (type === 'Course' || type === 'CourseBundle') {
    return typeof row.courseId === 'string' && row.courseId.length > 0;
  }
  return typeof row.productId === 'string' && row.productId.length > 0;
}
