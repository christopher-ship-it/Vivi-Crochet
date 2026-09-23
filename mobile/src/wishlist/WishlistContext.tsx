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
import {
  loadWishlistFromStorage,
  saveWishlistToStorage,
  WISHLIST_GUEST_OWNER,
} from './wishlistStorage';

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
  const { isLoading: sessionLoading } = useSession();
  const { user } = useShoppingSession();
  const ownerId = user?.id ?? WISHLIST_GUEST_OWNER;

  const [productIds, setProductIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const ownerIdRef = useRef(ownerId);
  const productIdsRef = useRef(productIds);
  ownerIdRef.current = ownerId;
  productIdsRef.current = productIds;

  useEffect(() => {
    if (sessionLoading) return;

    let cancelled = false;
    void (async () => {
      setIsLoading(true);
      setProductIds([]);
      productIdsRef.current = [];
      try {
        const stored = await loadWishlistFromStorage(ownerId);
        if (!cancelled && ownerIdRef.current === ownerId) {
          productIdsRef.current = stored;
          setProductIds(stored);
        }
      } catch {
        if (!cancelled && ownerIdRef.current === ownerId) {
          productIdsRef.current = [];
          setProductIds([]);
        }
      } finally {
        if (!cancelled && ownerIdRef.current === ownerId) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ownerId, sessionLoading]);

  const persist = useCallback(async (next: string[]) => {
    const owner = ownerIdRef.current;
    productIdsRef.current = next;
    setProductIds(next);
    await saveWishlistToStorage(owner, next);
  }, []);

  const isWishlisted = useCallback(
    (productId: string) => productIds.includes(productId),
    [productIds],
  );

  const addToWishlist = useCallback(
    async (productId: string) => {
      if (!productId || productIdsRef.current.includes(productId)) return;
      await persist([...productIdsRef.current, productId]);
    },
    [persist],
  );

  const removeFromWishlist = useCallback(
    async (productId: string) => {
      if (!productIdsRef.current.includes(productId)) return;
      await persist(productIdsRef.current.filter((id) => id !== productId));
    },
    [persist],
  );

  const toggleWishlist = useCallback(
    async (productId: string) => {
      if (!productId) return false;
      if (productIdsRef.current.includes(productId)) {
        await persist(productIdsRef.current.filter((id) => id !== productId));
        return false;
      }
      await persist([...productIdsRef.current, productId]);
      return true;
    },
    [persist],
  );

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
