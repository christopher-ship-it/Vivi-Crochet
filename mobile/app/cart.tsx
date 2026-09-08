import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getProduct } from '../src/api/products';
import { ApiClientError } from '../src/api/client';
import { useCart } from '../src/cart/CartContext';
import { cartSubtotal } from '../src/cart/calculations';
import { applyLiveStockToCartQuantity } from '../src/cart/stock';
import type { CartLineItem } from '../src/cart/types';
import { CartLineRow } from '../src/components/CartLineRow';
import { EmptyView, ErrorView, LoadingView } from '../src/components/StateViews';
import { colors, fonts, spacing } from '../src/theme';
import { formatInr } from '../src/utils/format';

export default function CartScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    items,
    itemCount,
    isLoading,
    storageError,
    clearStorageError,
    updateQuantity,
    removeItem,
    replaceItems,
  } = useCart();

  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [unavailableIds, setUnavailableIds] = useState<Set<string>>(new Set());

  const refreshPrices = useCallback(async () => {
    if (items.length === 0) return;
    setRefreshing(true);
    setRefreshError(null);
    const missing = new Set<string>();
    const stockNotes: string[] = [];
    const next: CartLineItem[] = [];

    for (const item of items) {
      try {
        const product = await getProduct(item.productId);
        const stock = product.availableStock ?? 0;
        if (stock <= 0) {
          missing.add(item.productId);
          stockNotes.push(`${product.name}: This product is out of stock.`);
          next.push({
            productId: product.id,
            quantity: item.quantity,
            name: product.name,
            price: product.price,
            imageUrl: product.imageUrl,
            category: product.category,
            availableStock: 0,
          });
          continue;
        }

        const adjusted = applyLiveStockToCartQuantity(item.quantity, stock);
        if (adjusted.reduced && adjusted.message) {
          stockNotes.push(`${product.name}: ${adjusted.message}`);
        }
        next.push({
          productId: product.id,
          quantity: adjusted.quantity,
          name: product.name,
          price: product.price,
          imageUrl: product.imageUrl,
          category: product.category,
          availableStock: stock,
        });
      } catch (err) {
        if (err instanceof ApiClientError && (err.status === 404 || err.code === 'PRODUCT_NOT_FOUND')) {
          missing.add(item.productId);
          next.push(item);
        } else {
          setRefreshError(
            err instanceof ApiClientError ? err.message : 'Could not refresh product prices.',
          );
          next.push(item);
        }
      }
    }

    const changed = next.some(
      (row, i) =>
        row.price !== items[i]?.price
        || row.name !== items[i]?.name
        || row.quantity !== items[i]?.quantity
        || row.availableStock !== items[i]?.availableStock,
    );
    if (changed) {
      try {
        await replaceItems(next);
      } catch {
        // storageError surfaced via context
      }
    }
    if (stockNotes.length > 0) {
      setRefreshError(stockNotes.join(' '));
    }
    setUnavailableIds(missing);
    setRefreshing(false);
  }, [items, replaceItems]);

  useEffect(() => {
    if (!isLoading && items.length > 0) {
      refreshPrices();
    }
  }, [isLoading]); // eslint-disable-line react-hooks/exhaustive-deps — refresh once after hydrate

  const subtotal = cartSubtotal(items);
  const hasUnavailable = unavailableIds.size > 0;

  if (isLoading) {
    return <LoadingView message="Loading your cart…" />;
  }

  if (storageError && items.length === 0) {
    return (
      <ErrorView
        title="Cart unavailable"
        message={storageError}
        onRetry={clearStorageError}
      />
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <EmptyView
          title="Your cart is empty"
          message="Browse handmade pieces in the shop and add something you love."
        />
        <Pressable style={styles.shopBtn} onPress={() => router.push('/(tabs)/shop')}>
          <Text style={styles.shopBtnText}>Browse shop →</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.title}>Your cart</Text>
          <Text style={styles.meta}>{itemCount} item{itemCount === 1 ? '' : 's'}</Text>
        </View>

        {(storageError || refreshError) && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>{storageError ?? refreshError}</Text>
            {storageError && (
              <Pressable onPress={clearStorageError}>
                <Text style={styles.bannerAction}>Dismiss</Text>
              </Pressable>
            )}
          </View>
        )}

        {refreshing && (
          <Text style={styles.refreshing}>Updating prices…</Text>
        )}

        {items.map((item, index) => (
          <CartLineRow
            key={item.productId}
            item={item}
            index={index}
            unavailable={unavailableIds.has(item.productId)}
            onIncrease={() => void updateQuantity(item.productId, item.quantity + 1)}
            onDecrease={() => {
              if (item.quantity <= 1) {
                void removeItem(item.productId);
              } else {
                void updateQuantity(item.productId, item.quantity - 1);
              }
            }}
            onRemove={() => void removeItem(item.productId)}
          />
        ))}

        {hasUnavailable && (
          <Pressable
            style={styles.removeUnavailable}
            onPress={() => {
              const ids = unavailableIds;
              Promise.all([...ids].map((id) => removeItem(id)));
            }}
          >
            <Text style={styles.removeUnavailableText}>Remove unavailable items</Text>
          </Pressable>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.subtotalRow}>
          <Text style={styles.subtotalLabel}>Subtotal</Text>
          <Text style={styles.subtotalValue}>{formatInr(subtotal)}</Text>
        </View>
        <Text style={styles.footerHint}>Delivery calculated at checkout</Text>
        <Pressable
          style={[styles.checkoutBtn, hasUnavailable && styles.checkoutBtnDisabled]}
          disabled={hasUnavailable}
          onPress={() => router.push('/checkout')}
        >
          <Text style={styles.checkoutBtnText}>Proceed to checkout →</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  scroll: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
  },
  emptyWrap: {
    flex: 1,
    backgroundColor: colors.cream,
    justifyContent: 'center',
  },
  header: {
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 26,
    color: colors.ink,
    letterSpacing: -0.4,
  },
  meta: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    marginTop: 4,
  },
  banner: {
    backgroundColor: colors.pinkMist,
    borderWidth: 1,
    borderColor: colors.softBorder,
    borderRadius: 14,
    padding: 12,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  bannerText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.ink,
    lineHeight: 17,
  },
  bannerAction: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.pink,
  },
  refreshing: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
    marginBottom: spacing.sm,
  },
  removeUnavailable: {
    marginTop: spacing.sm,
    paddingVertical: 10,
    alignItems: 'center',
  },
  removeUnavailableText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.danger,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.softBorder,
    backgroundColor: colors.white,
    padding: spacing.md,
  },
  subtotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  subtotalLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  subtotalValue: {
    fontFamily: fonts.extraBold,
    fontSize: 24,
    color: colors.ink,
    letterSpacing: -0.3,
  },
  footerHint: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
    marginTop: 4,
    marginBottom: spacing.md,
  },
  checkoutBtn: {
    backgroundColor: colors.pink,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  checkoutBtnDisabled: {
    opacity: 0.5,
  },
  checkoutBtnText: {
    fontFamily: fonts.extraBold,
    fontSize: 15,
    color: colors.white,
  },
  shopBtn: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.pink,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  shopBtnText: {
    fontFamily: fonts.extraBold,
    fontSize: 15,
    color: colors.white,
  },
});
