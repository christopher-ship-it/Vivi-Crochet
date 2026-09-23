import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useSession, useShoppingSession } from '../auth/SessionContext';
import type { Product } from '../types';
import { cartItemCount, cartSubtotal, clampQuantity } from './calculations';
import { clampQuantityToStock } from './stock';
import { CART_GUEST_OWNER, loadCartFromStorage, saveCartToStorage } from './storage';
import type { CartLineItem } from './types';

function productToLine(product: Product, quantity: number): CartLineItem {
  const stock = product.availableStock ?? 0;
  const qty = stock <= 0 ? 0 : clampQuantityToStock(quantity, stock);
  return {
    productId: product.id,
    quantity: qty,
    name: product.name,
    price: product.price,
    imageUrl: product.imageUrl,
    category: product.category,
    availableStock: stock,
    productType: product.productType ?? 'Handmade',
  };
}

interface CartContextValue {
  items: CartLineItem[];
  itemCount: number;
  subtotal: number;
  isLoading: boolean;
  storageError: string | null;
  clearStorageError: () => void;
  /** Latest cart lines (survives concurrent async updates). */
  peekItems: () => CartLineItem[];
  addProduct: (product: Product, quantity: number) => Promise<void>;
  /**
   * Ensure this product is in the cart at the given quantity without clearing
   * other lines (e.g. crochet essentials already added).
   */
  setCartToProduct: (product: Product, quantity: number) => Promise<void>;
  updateQuantity: (productId: string, quantity: number) => Promise<void>;
  removeItem: (productId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  replaceItems: (items: CartLineItem[]) => Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const { isLoading: sessionLoading } = useSession();
  const { user } = useShoppingSession();
  const ownerId = user?.id ?? CART_GUEST_OWNER;

  const [items, setItems] = useState<CartLineItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [storageError, setStorageError] = useState<string | null>(null);
  const itemsRef = useRef<CartLineItem[]>([]);
  const ownerIdRef = useRef(ownerId);
  itemsRef.current = items;
  ownerIdRef.current = ownerId;

  // Reload when the signed-in customer changes (logout / switch account).
  useEffect(() => {
    if (sessionLoading) return;

    let cancelled = false;
    async function hydrate() {
      setIsLoading(true);
      // Clear immediately so the previous account's lines never flash.
      itemsRef.current = [];
      setItems([]);
      try {
        const stored = await loadCartFromStorage(ownerId);
        if (!cancelled && ownerIdRef.current === ownerId) {
          itemsRef.current = stored;
          setItems(stored);
        }
      } catch (err) {
        if (!cancelled && ownerIdRef.current === ownerId) {
          setStorageError(err instanceof Error ? err.message : 'Could not load your cart.');
          itemsRef.current = [];
          setItems([]);
        }
      } finally {
        if (!cancelled && ownerIdRef.current === ownerId) setIsLoading(false);
      }
    }
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [ownerId, sessionLoading]);

  const persist = useCallback(async (next: CartLineItem[]) => {
    const owner = ownerIdRef.current;
    itemsRef.current = next;
    setItems(next);
    try {
      await saveCartToStorage(owner, next);
      // Ignore stale writes if the user switched mid-save.
      if (ownerIdRef.current !== owner) return;
      setStorageError(null);
    } catch (err) {
      if (ownerIdRef.current !== owner) return;
      setStorageError(err instanceof Error ? err.message : 'Could not save your cart.');
      throw err;
    }
  }, []);

  const addProduct = useCallback(
    async (product: Product, quantity: number) => {
      const stock = product.availableStock ?? 0;
      if (stock <= 0) {
        throw new Error('This product is out of stock.');
      }
      const current = itemsRef.current;
      const existing = current.find((i) => i.productId === product.id);
      const desired = (existing?.quantity ?? 0) + quantity;
      if (desired > stock) {
        throw new Error(`Only ${stock} available.`);
      }
      const qty = clampQuantityToStock(desired, stock);
      const next = existing
        ? current.map((i) => (i.productId === product.id ? productToLine(product, qty) : i))
        : [...current, productToLine(product, qty)];
      await persist(next);
    },
    [persist],
  );

  /** Upsert product qty; never wipe other cart lines (essentials, etc.). */
  const setCartToProduct = useCallback(
    async (product: Product, quantity: number) => {
      const stock = product.availableStock ?? 0;
      if (stock <= 0) {
        throw new Error('This product is out of stock.');
      }
      if (quantity > stock) {
        throw new Error(`Only ${stock} available.`);
      }
      const current = itemsRef.current;
      const line = productToLine(product, quantity);
      const exists = current.some((i) => i.productId === product.id);
      const next = exists
        ? current.map((i) => (i.productId === product.id ? line : i))
        : [...current, line];
      await persist(next);
    },
    [persist],
  );

  const updateQuantity = useCallback(
    async (productId: string, quantity: number) => {
      const current = itemsRef.current;
      if (quantity <= 0) {
        await persist(current.filter((i) => i.productId !== productId));
        return;
      }

      const next = current.map((i) => {
        if (i.productId !== productId) return i;
        const stock = i.availableStock;
        if (typeof stock === 'number') {
          if (stock <= 0) {
            return { ...i, quantity: Math.min(i.quantity, 1) };
          }
          return { ...i, quantity: clampQuantityToStock(quantity, stock) };
        }
        return { ...i, quantity: clampQuantity(quantity) };
      });
      await persist(next.filter((i) => i.quantity > 0));
    },
    [persist],
  );

  const removeItem = useCallback(
    async (productId: string) => {
      await persist(itemsRef.current.filter((i) => i.productId !== productId));
    },
    [persist],
  );

  const clearCart = useCallback(async () => {
    await persist([]);
  }, [persist]);

  const replaceItems = useCallback(
    async (nextItems: CartLineItem[]) => {
      const normalized = nextItems
        .map((i) => {
          const stock = i.availableStock;
          if (typeof stock === 'number') {
            if (stock <= 0) {
              return { ...i, availableStock: 0 };
            }
            const qty = clampQuantityToStock(i.quantity, stock);
            return { ...i, quantity: qty };
          }
          return {
            ...i,
            quantity: clampQuantity(Math.max(1, i.quantity)),
          };
        })
        .filter((i) => {
          if (typeof i.availableStock === 'number' && i.availableStock <= 0) return true;
          return i.quantity > 0;
        });
      await persist(normalized);
    },
    [persist],
  );

  const peekItems = useCallback(() => itemsRef.current, []);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      itemCount: cartItemCount(items),
      subtotal: cartSubtotal(items),
      isLoading,
      storageError,
      clearStorageError: () => setStorageError(null),
      peekItems,
      addProduct,
      setCartToProduct,
      updateQuantity,
      removeItem,
      clearCart,
      replaceItems,
    }),
    [
      items,
      isLoading,
      storageError,
      peekItems,
      addProduct,
      setCartToProduct,
      updateQuantity,
      removeItem,
      clearCart,
      replaceItems,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
