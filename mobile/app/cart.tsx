import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCourse } from '../src/api/courses';
import { listMyEnrollments, type Enrollment } from '../src/api/enrollments';
import { getProduct } from '../src/api/products';
import { ApiClientError } from '../src/api/client';
import { useShoppingSession } from '../src/auth/SessionContext';
import { useCart } from '../src/cart/CartContext';
import { cartSubtotal } from '../src/cart/calculations';
import {
  buildCartRecommendations,
  FOUNDATION_COURSE_ID,
  type CartItemRecommendation,
} from '../src/cart/recommendations';
import { applyLiveStockToCartQuantity, canIncreaseQuantity } from '../src/cart/stock';
import type { CartLineItem } from '../src/cart/types';
import { CartLineRow } from '../src/components/CartLineRow';
import {
  CartRecommendBlock,
  essentialToProduct,
} from '../src/components/CartRecommendBlock';
import { HeroGradient } from '../src/components/HeroGradient';
import { EmptyView, ErrorView, LoadingView } from '../src/components/StateViews';
import { useI18n } from '../src/i18n';
import { uiFonts, type UiFonts } from '../src/i18n/uiFonts';
import { colors, spacing } from '../src/theme';
import type { Course, Product, RecommendedEssentialSummary } from '../src/types';
import { formatInr } from '../src/utils/format';

function createStyles(fonts: UiFonts) {
  return StyleSheet.create({
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
      // Nudge empty state + Browse shop slightly above true center.
      paddingBottom: 72,
    },
    header: {
      marginBottom: spacing.md,
      marginHorizontal: -spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    meta: {
      fontFamily: fonts.regular,
      fontSize: 13,
      color: colors.muted,
      textAlign: 'center',
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
      marginTop: spacing.sm,
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
}

export default function CartScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, language } = useI18n();
  const fonts = uiFonts(language);
  const styles = useMemo(() => createStyles(fonts), [language]);
  const { isAuthenticated } = useShoppingSession();
  const {
    items,
    itemCount,
    isLoading,
    storageError,
    clearStorageError,
    addProduct,
    updateQuantity,
    removeItem,
    replaceItems,
    peekItems,
  } = useCart();

  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [unavailableIds, setUnavailableIds] = useState<Set<string>>(new Set());
  const [productById, setProductById] = useState<Record<string, Product>>({});
  const [enrollments, setEnrollments] = useState<Enrollment[] | null>(null);
  const [foundationCourse, setFoundationCourse] = useState<Course | null>(null);
  const recoRequestId = useRef(0);

  const refreshPrices = useCallback(async () => {
    if (items.length === 0) return;
    setRefreshing(true);
    setRefreshError(null);
    const missing = new Set<string>();
    const stockNotes: string[] = [];
    const next: CartLineItem[] = [];
    const fetched: Record<string, Product> = {};
    const snapshotIds = items.map((i) => i.productId);
    const snapshotKey = snapshotIds.join(',');

    for (const item of items) {
      try {
        const product = await getProduct(item.productId);
        fetched[product.id] = product;
        const stock = product.availableStock ?? 0;
        if (stock <= 0) {
          missing.add(item.productId);
          stockNotes.push(t('cart.outOfStockNamed', { name: product.name }));
          next.push({
            productId: product.id,
            quantity: item.quantity,
            name: product.name,
            price: product.price,
            imageUrl: product.imageUrl,
            category: product.category,
            availableStock: 0,
            productType: product.productType ?? item.productType,
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
          productType: product.productType ?? item.productType,
        });
      } catch (err) {
        const message =
          err instanceof ApiClientError ? err.message : t('cart.priceRefreshFailed');
        stockNotes.push(`${item.name}: ${message}`);
        next.push(item);
      }
    }

    setProductById((prev) => ({ ...prev, ...fetched }));

    // If the shopper added essentials (or other lines) while prices refreshed,
    // merge refreshed rows into the live cart instead of wiping new lines.
    const liveItems = peekItems();
    const liveKey = liveItems.map((i) => i.productId).join(',');
    const cartChangedDuringRefresh = liveKey !== snapshotKey;

    let toPersist = next;
    if (cartChangedDuringRefresh) {
      const refreshedById = new Map(next.map((line) => [line.productId, line]));
      toPersist = liveItems.map((line) => refreshedById.get(line.productId) ?? line);
      const liveIdSet = new Set(liveItems.map((i) => i.productId));
      for (const id of [...missing]) {
        if (!liveIdSet.has(id)) missing.delete(id);
      }
    }

    const changed = toPersist.some((line, i) => {
      const prev = liveItems[i];
      if (!prev || prev.productId !== line.productId) return true;
      return (
        line.quantity !== prev.quantity ||
        line.price !== prev.price ||
        line.availableStock !== prev.availableStock
      );
    });
    if (changed || toPersist.length !== liveItems.length) {
      try {
        await replaceItems(toPersist);
      } catch {
        // storageError surfaced via context
      }
    }
    if (stockNotes.length > 0) {
      setRefreshError(stockNotes.join(' '));
    }
    setUnavailableIds(missing);
    setRefreshing(false);
  }, [items, peekItems, replaceItems, t]);

  useEffect(() => {
    if (!isLoading && items.length > 0) {
      refreshPrices();
    }
  }, [isLoading]); // eslint-disable-line react-hooks/exhaustive-deps — refresh once after hydrate

  const cartProductIdsKey = items.map((i) => i.productId).join(',');

  /** Load enrollments + Foundation for recommendation layer (never blocks cart). */
  useEffect(() => {
    const id = ++recoRequestId.current;
    let cancelled = false;

    (async () => {
      try {
        const foundation = await getCourse(FOUNDATION_COURSE_ID).catch(() => null);
        if (!cancelled && id === recoRequestId.current) {
          setFoundationCourse(foundation);
        }
      } catch {
        // ignore
      }

      if (!isAuthenticated) {
        if (!cancelled && id === recoRequestId.current) setEnrollments(null);
        return;
      }

      try {
        const list = await listMyEnrollments();
        if (!cancelled && id === recoRequestId.current) setEnrollments(list);
      } catch {
        if (!cancelled && id === recoRequestId.current) setEnrollments([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, cartProductIdsKey]);

  const recommendations = useMemo(() => {
    const handmade = Object.values(productById).filter(
      (p) => (p.productType ?? 'Handmade') === 'Handmade',
    );
    if (handmade.length === 0) return {} as Record<string, CartItemRecommendation>;
    return buildCartRecommendations({
      handmadeProducts: handmade,
      enrollments: isAuthenticated ? enrollments : null,
      foundationCourse,
      cartProductIds: new Set(items.map((i) => i.productId)),
    });
  }, [productById, enrollments, foundationCourse, items, isAuthenticated]);

  const handleAddEssential = useCallback(
    async (essential: RecommendedEssentialSummary) => {
      // Prefer live stock from API so cart qty cannot exceed availability.
      try {
        const live = await getProduct(essential.id);
        await addProduct(live, 1);
      } catch (firstErr) {
        try {
          await addProduct(essentialToProduct(essential), 1);
        } catch (secondErr) {
          const message =
            secondErr instanceof Error
              ? secondErr.message
              : firstErr instanceof Error
                ? firstErr.message
                : t('cart.priceRefreshFailed');
          setRefreshError(message);
          throw secondErr;
        }
      }
    },
    [addProduct, t],
  );

  const handleRemoveEssential = useCallback(
    async (productId: string) => {
      await removeItem(productId);
    },
    [removeItem],
  );

  const subtotal = cartSubtotal(items);
  const hasUnavailable = unavailableIds.size > 0;

  const itemCountLabel =
    itemCount === 1 ? t('cart.itemCountOne') : t('cart.itemCountMany', { count: itemCount });

  if (isLoading) {
    return <LoadingView message={t('cart.loadingCart')} />;
  }

  if (storageError && items.length === 0) {
    return (
      <ErrorView
        title={t('cart.unavailableTitle')}
        message={storageError}
        onRetry={clearStorageError}
      />
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <EmptyView title={t('cart.emptyTitle')} message={t('cart.emptyMessage')} />
        <Pressable style={styles.shopBtn} onPress={() => router.push('/(tabs)/shop')}>
          <Text style={styles.shopBtnText}>{t('cart.browseShop')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <HeroGradient style={styles.header}>
          <Text style={styles.meta}>{itemCountLabel}</Text>
        </HeroGradient>

        {(storageError || refreshError) && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>{storageError ?? refreshError}</Text>
            {storageError && (
              <Pressable onPress={clearStorageError}>
                <Text style={styles.bannerAction}>{t('common.dismiss')}</Text>
              </Pressable>
            )}
          </View>
        )}

        {refreshing && <Text style={styles.refreshing}>{t('cart.updatingPrices')}</Text>}

        {items.map((item, index) => {
          const reco = recommendations[item.productId];
          const showReco = Boolean(reco && (reco.course || reco.essentials.length > 0));
          return (
            <View key={item.productId}>
              <CartLineRow
                item={item}
                index={index}
                unavailable={unavailableIds.has(item.productId)}
                attachBelow={showReco}
                compact={
                  item.productType === 'Resell' ||
                  productById[item.productId]?.productType === 'Resell'
                }
                onIncrease={() => {
                  if (
                    typeof item.availableStock === 'number' &&
                    !canIncreaseQuantity(item.quantity, item.availableStock)
                  ) {
                    return;
                  }
                  void updateQuantity(item.productId, item.quantity + 1);
                }}
                onDecrease={() => {
                  if (item.quantity <= 1) {
                    void removeItem(item.productId);
                  } else {
                    void updateQuantity(item.productId, item.quantity - 1);
                  }
                }}
                onRemove={() => void removeItem(item.productId)}
              />
              {showReco && reco ? (
                <CartRecommendBlock
                  recommendation={reco}
                  onAddEssential={handleAddEssential}
                  onRemoveEssential={handleRemoveEssential}
                  onOpenCourse={(courseId) => router.push(`/course/${courseId}`)}
                  isInCart={(productId) => items.some((line) => line.productId === productId)}
                  cartQuantity={(productId) =>
                    items.find((line) => line.productId === productId)?.quantity ?? 0
                  }
                />
              ) : null}
            </View>
          );
        })}

        {hasUnavailable && (
          <Pressable
            style={styles.removeUnavailable}
            onPress={() => {
              for (const id of unavailableIds) {
                void removeItem(id);
              }
            }}
          >
            <Text style={styles.removeUnavailableText}>{t('cart.removeUnavailable')}</Text>
          </Pressable>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.subtotalRow}>
          <Text style={styles.subtotalLabel}>{t('cart.subtotal')}</Text>
          <Text style={styles.subtotalValue}>{formatInr(subtotal)}</Text>
        </View>
        <Text style={styles.footerHint}>{t('cart.deliveryHint')}</Text>
        <Pressable
          style={[styles.checkoutBtn, hasUnavailable && styles.checkoutBtnDisabled]}
          disabled={hasUnavailable}
          onPress={() => router.push('/checkout')}
        >
          <Text style={styles.checkoutBtnText}>{t('cart.proceedCheckout')}</Text>
        </Pressable>
      </View>
    </View>
  );
}
