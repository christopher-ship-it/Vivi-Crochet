import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Product } from '../types';
import { cartItemCount, cartSubtotal, clampQuantity } from './calculations';
import { clampQuantityToStock } from './stock';
import { loadCartFromStorage, saveCartToStorage } from './storage';
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
  };
}

interface CartContextValue {
  items: CartLineItem[];
  itemCount: number;
  subtotal: number;
  isLoading: boolean;
  storageError: string | null;
  clearStorageError: () => void;
  addProduct: (product: Product, quantity: number) => Promise<void>;
  setCartToProduct: (product: Product, quantity: number) => Promise<void>;
  updateQuantity: (productId: string, quantity: number) => Promise<void>;
  removeItem: (productId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  replaceItems: (items: CartLineItem[]) => Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartLineItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      setIsLoading(true);
      try {
        const stored = await loadCartFromStorage();
        if (!cancelled) setItems(stored);
      } catch (err) {
        if (!cancelled) {
          setStorageError(err instanceof Error ? err.message : 'Could not load your cart.');
          setItems([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    hydrate();
    return () => { cancelled = true; };
  }, []);

  const persist = useCallback(async (next: CartLineItem[]) => {
    setItems(next);
    try {
      await saveCartToStorage(next);
      setStorageError(null);
    } catch (err) {
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
      const existing = items.find((i) => i.productId === product.id);
      const desired = (existing?.quantity ?? 0) + quantity;
      if (desired > stock) {
        throw new Error(`Only ${stock} available.`);
      }
      const qty = clampQuantityToStock(desired, stock);
      let next: CartLineItem[];
      if (existing) {
        next = items.map((i) =>
          i.productId === product.id ? productToLine(product, qty) : i,
        );
      } else {
        next = [...items, productToLine(product, qty)];
      }
      await persist(next);
    },
    [items, persist],
  );

  const setCartToProduct = useCallback(
    async (product: Product, quantity: number) => {
      const stock = product.availableStock ?? 0;
      if (stock <= 0) {
        throw new Error('This product is out of stock.');
      }
      if (quantity > stock) {
        throw new Error(`Only ${stock} available.`);
      }
      await persist([productToLine(product, quantity)]);
    },
    [persist],
  );

  const updateQuantity = useCallback(
    async (productId: string, quantity: number) => {
      if (quantity <= 0) {
        await persist(items.filter((i) => i.productId !== productId));
        return;
      }

      const next = items.map((i) => {
        if (i.productId !== productId) return i;
        const stock = i.availableStock;
        const qty =
          typeof stock === 'number'
            ? clampQuantityToStock(quantity, stock)
            : clampQuantity(quantity);
        return { ...i, quantity: qty };
      });
      await persist(next);
    },
    [items, persist],
  );

  const removeItem = useCallback(
    async (productId: string) => {
      await persist(items.filter((i) => i.productId !== productId));
    },
    [items, persist],
  );

  const clearCart = useCallback(async () => {
    await persist([]);
  }, [persist]);

  const replaceItems = useCallback(
    async (nextItems: CartLineItem[]) => {
      await persist(nextItems.map((i) => ({ ...i, quantity: clampQuantity(i.quantity) })));
    },
    [persist],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      itemCount: cartItemCount(items),
      subtotal: cartSubtotal(items),
      isLoading,
      storageError,
      clearStorageError: () => setStorageError(null),
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
