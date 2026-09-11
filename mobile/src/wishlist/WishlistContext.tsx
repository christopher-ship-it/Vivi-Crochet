import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { loadWishlistFromStorage, saveWishlistToStorage } from './wishlistStorage';

interface WishlistContextValue {
  productIds: string[];
  isLoading: boolean;
  isWishlisted: (productId: string) => boolean;
  toggleWishlist: (productId: string) => Promise<boolean>;
  addToWishlist: (productId: string) => Promise<void>;
  removeFromWishlist: (productId: string) => Promise<void>;
}

const WishlistContext = createContext<WishlistContextValue | null>(null);

export function WishlistProvider({ children }: { children: ReactNode }) {
  const [productIds, setProductIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setIsLoading(true);
      try {
        const stored = await loadWishlistFromStorage();
        if (!cancelled) setProductIds(stored);
      } catch {
        if (!cancelled) setProductIds([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async (next: string[]) => {
    setProductIds(next);
    await saveWishlistToStorage(next);
  }, []);

  const isWishlisted = useCallback(
    (productId: string) => productIds.includes(productId),
    [productIds],
  );

  const addToWishlist = useCallback(async (productId: string) => {
    if (!productId || productIds.includes(productId)) return;
    await persist([...productIds, productId]);
  }, [persist, productIds]);

  const removeFromWishlist = useCallback(async (productId: string) => {
    if (!productIds.includes(productId)) return;
    await persist(productIds.filter((id) => id !== productId));
  }, [persist, productIds]);

  const toggleWishlist = useCallback(async (productId: string) => {
    if (!productId) return false;
    if (productIds.includes(productId)) {
      await persist(productIds.filter((id) => id !== productId));
      return false;
    }
    await persist([...productIds, productId]);
    return true;
  }, [persist, productIds]);

  const value = useMemo(
    () => ({
      productIds,
      isLoading,
      isWishlisted,
      toggleWishlist,
      addToWishlist,
      removeFromWishlist,
    }),
    [productIds, isLoading, isWishlisted, toggleWishlist, addToWishlist, removeFromWishlist],
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist must be used within WishlistProvider');
  return ctx;
}
