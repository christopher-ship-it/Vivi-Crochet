import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getProduct } from '../../src/api/products';
import { ApiClientError } from '../../src/api/client';
import { useCart } from '../../src/cart/CartContext';
import { canIncreaseQuantity, isOutOfStock } from '../../src/cart/stock';
import { LearnThisModal } from '../../src/components/LearnThisModal';
import { ErrorView, LoadingView } from '../../src/components/StateViews';
import type { Product } from '../../src/types';
import { colors, fonts, radii, spacing } from '../../src/theme';
import { formatInr } from '../../src/utils/format';
import { LEARN_PROMPT_DELAY_MS } from '../../src/utils/learnPromptTimer';

const HERO_COLORS = ['#ffe3ec', '#fff0f4', '#ffeaf1', '#ffffff'];
const SCREEN_WIDTH = Dimensions.get('window').width;
const HERO_MIN_HEIGHT = 200;
const HERO_MAX_HEIGHT = 300;
const HERO_DEFAULT_HEIGHT = 240;

function fitHeroHeight(imageWidth: number, imageHeight: number): number {
  if (imageWidth <= 0 || imageHeight <= 0) return HERO_DEFAULT_HEIGHT;
  const fitted = Math.round(SCREEN_WIDTH * (imageHeight / imageWidth));
  return Math.min(HERO_MAX_HEIGHT, Math.max(HERO_MIN_HEIGHT, fitted));
}

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [learnModalVisible, setLearnModalVisible] = useState(false);
  const [learnDismissed, setLearnDismissed] = useState(false);
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [cartMessage, setCartMessage] = useState<string | null>(null);
  const [cartError, setCartError] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState(0);
  const [heroHeight, setHeroHeight] = useState(HERO_DEFAULT_HEIGHT);
  const { addProduct, setCartToProduct } = useCart();
  const learnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLearnTimer = useCallback(() => {
    if (learnTimerRef.current) {
      clearTimeout(learnTimerRef.current);
      learnTimerRef.current = null;
    }
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getProduct(id);
      setProduct(data);
      setLearnDismissed(false);
      setLearnModalVisible(false);
      const stock = data.availableStock ?? 0;
      setQty(stock > 0 ? 1 : 0);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load product.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      clearLearnTimer();
      setLearnModalVisible(false);

      if (!product?.linkedCourse || learnDismissed || loading) {
        return () => clearLearnTimer();
      }

      learnTimerRef.current = setTimeout(() => {
        setLearnModalVisible(true);
      }, LEARN_PROMPT_DELAY_MS);

      return () => clearLearnTimer();
    }, [product?.linkedCourse, product?.id, learnDismissed, loading, clearLearnTimer]),
  );

  const galleryUrls = useMemo(() => {
    if (!product) return [];
    const fromImages = (product.images ?? [])
      .slice()
      .sort((a, b) => Number(b.isMain) - Number(a.isMain) || a.sortOrder - b.sortOrder)
      .map((i) => i.url)
      .filter(Boolean);
    if (fromImages.length > 0) return fromImages;
    return product.imageUrl ? [product.imageUrl] : [];
  }, [product]);

  useEffect(() => {
    setActiveImage(0);
    setHeroHeight(HERO_DEFAULT_HEIGHT);
    const url = galleryUrls[0];
    if (!url) return;

    let cancelled = false;
    Image.getSize(
      url,
      (width, height) => {
        if (!cancelled) setHeroHeight(fitHeroHeight(width, height));
      },
      () => {
        if (!cancelled) setHeroHeight(HERO_DEFAULT_HEIGHT);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [galleryUrls]);

  useEffect(() => {
    const url = galleryUrls[activeImage];
    if (!url) return;

    let cancelled = false;
    Image.getSize(
      url,
      (width, height) => {
        if (!cancelled) setHeroHeight(fitHeroHeight(width, height));
      },
      () => {
        /* keep current height if a secondary slide fails to measure */
      },
    );
    return () => {
      cancelled = true;
    };
  }, [activeImage, galleryUrls]);

  if (loading) return <LoadingView message="Loading product…" />;
  if (error || !product) {
    return <ErrorView message={error ?? 'Product not found.'} onRetry={load} />;
  }

  const heroColor = HERO_COLORS[product.name.length % HERO_COLORS.length];
  const discount =
    product.mrp && product.mrp > product.price
      ? Math.round(((product.mrp - product.price) / product.mrp) * 100)
      : null;
  const course = product.linkedCourse;
  const stock = product.availableStock ?? 0;
  const outOfStock = isOutOfStock(stock);
  const atMaxQty = !canIncreaseQuantity(qty, stock);
  const lowStock = stock > 0 && stock <= 5;

  const learnMeta = course
    ? [course.level, `${course.videoCount} lessons`, `from ${formatInr(course.price)}`]
        .filter(Boolean)
        .join(' · ')
    : null;

  function onGalleryScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setActiveImage(index);
  }

  function goToCourse() {
    if (!course) return;
    setLearnModalVisible(false);
    setLearnDismissed(true);
    clearLearnTimer();
    router.push(`/course/${course.id}`);
  }

  function dismissLearnPrompt() {
    setLearnModalVisible(false);
    setLearnDismissed(true);
    clearLearnTimer();
  }

  async function handleAddToCart() {
    if (!product || outOfStock) return;
    setAdding(true);
    setCartError(null);
    setCartMessage(null);
    try {
      await addProduct(product, qty);
      setCartMessage(`Added ${qty} to your cart.`);
    } catch (err) {
      setCartError(err instanceof Error ? err.message : 'Could not add to cart.');
    } finally {
      setAdding(false);
    }
  }

  async function handleBuyNow() {
    if (!product || outOfStock) return;
    setAdding(true);
    setCartError(null);
    setCartMessage(null);
    try {
      await setCartToProduct(product, qty);
      router.push('/cart');
    } catch (err) {
      setCartError(err instanceof Error ? err.message : 'Could not update cart.');
      setAdding(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: product.name }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {galleryUrls.length > 0 ? (
          <View style={[styles.gallery, { height: heroHeight }]}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={onGalleryScroll}
            >
              {galleryUrls.map((url) => (
                <View key={url} style={[styles.heroSlide, { height: heroHeight }]}>
                  <Image
                    source={{ uri: url }}
                    style={{ width: SCREEN_WIDTH, height: heroHeight }}
                    resizeMode="contain"
                    accessibilityLabel={product.name}
                  />
                </View>
              ))}
            </ScrollView>
            {galleryUrls.length > 1 && (
              <View style={styles.dots}>
                {galleryUrls.map((url, index) => (
                  <View
                    key={`${url}-${index}`}
                    style={[styles.dot, index === activeImage && styles.dotActive]}
                  />
                ))}
              </View>
            )}
          </View>
        ) : (
          <View style={[styles.hero, { height: heroHeight, backgroundColor: heroColor }]}>
            <Text style={styles.heroInitial}>{product.name.charAt(0)}</Text>
          </View>
        )}

        <View style={styles.body}>
          <Text style={styles.category}>{product.category.toUpperCase()}</Text>
          <Text style={styles.name}>{product.name}</Text>

          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatInr(product.price)}</Text>
            {product.mrp && product.mrp > product.price && (
              <Text style={styles.mrp}>{formatInr(product.mrp)}</Text>
            )}
            {discount !== null && (
              <View style={styles.offBadge}>
                <Text style={styles.offText}>{discount}% off</Text>
              </View>
            )}
          </View>

          {product.description && <Text style={styles.desc}>{product.description}</Text>}

          <View style={styles.tags}>
            {product.spec1 && <Text style={styles.tag}>{product.spec1}</Text>}
            {product.spec2 && <Text style={styles.tag}>{product.spec2}</Text>}
            <Text style={styles.tag}>Hand wash</Text>
            <Text style={styles.tag}>Made to order</Text>
          </View>

          {outOfStock ? (
            <View style={styles.oosBanner}>
              <Text style={styles.oosText}>OUT OF STOCK</Text>
            </View>
          ) : (
            <View style={styles.qtyRow}>
              <Text style={styles.qtyLabel}>Quantity</Text>
              <View style={styles.qtyControl}>
                <Pressable
                  style={[styles.qtyBtn, qty <= 1 && styles.qtyBtnDisabled]}
                  disabled={qty <= 1}
                  onPress={() => setQty((q) => Math.max(1, q - 1))}
                >
                  <Text style={styles.qtyBtnText}>−</Text>
                </Pressable>
                <Text style={styles.qtyValue}>{qty}</Text>
                <Pressable
                  style={[styles.qtyBtn, atMaxQty && styles.qtyBtnDisabled]}
                  disabled={atMaxQty}
                  onPress={() => setQty((q) => (canIncreaseQuantity(q, stock) ? q + 1 : q))}
                >
                  <Text style={styles.qtyBtnText}>+</Text>
                </Pressable>
              </View>
            </View>
          )}

          {!outOfStock && lowStock && (
            <Text style={styles.stockHint}>
              {atMaxQty
                ? 'Maximum quantity reached · Few stocks left'
                : 'Few stocks left'}
            </Text>
          )}

          <Pressable
            style={[styles.addBtn, (adding || outOfStock) && styles.btnDisabled]}
            onPress={handleAddToCart}
            disabled={adding || outOfStock}
          >
            <Text style={styles.addBtnText}>
              {outOfStock ? 'Out of stock' : adding ? 'Adding…' : 'Add to cart'}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.buyBtn, (adding || outOfStock) && styles.btnDisabled]}
            onPress={handleBuyNow}
            disabled={adding || outOfStock}
          >
            <Text style={styles.buyBtnText}>{outOfStock ? 'Unavailable' : 'Buy now →'}</Text>
          </Pressable>

          {course && (
            <Pressable style={styles.learnBanner} onPress={goToCourse}>
              <View style={styles.learnIcon}>
                <Text style={styles.learnIconText}>▶</Text>
              </View>
              <View style={styles.learnBody}>
                <Text style={styles.learnEyebrow}>LEARN</Text>
                <Text style={styles.learnTitle}>Want to learn this?</Text>
                {learnMeta && <Text style={styles.learnMeta}>{learnMeta}</Text>}
              </View>
              <Text style={styles.learnArrow}>→</Text>
            </Pressable>
          )}

          {cartMessage && (
            <View style={styles.successBanner}>
              <Text style={styles.successText}>{cartMessage}</Text>
              <Pressable onPress={() => router.push('/cart')}>
                <Text style={styles.successLink}>View cart →</Text>
              </Pressable>
            </View>
          )}

          {cartError && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{cartError}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {course && (
        <LearnThisModal
          visible={learnModalVisible}
          productName={product.name}
          course={course}
          onLearn={goToCourse}
          onDismiss={dismissLearnPrompt}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  content: {
    paddingBottom: 40,
  },
  hero: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.canvas,
  },
  gallery: {
    position: 'relative',
    backgroundColor: colors.canvas,
    overflow: 'hidden',
  },
  heroSlide: {
    width: SCREEN_WIDTH,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(34, 26, 30, 0.2)',
  },
  dotActive: {
    backgroundColor: colors.pink,
    width: 18,
  },
  heroInitial: {
    fontFamily: fonts.extraBold,
    fontSize: 96,
    color: colors.ink,
    opacity: 0.12,
  },
  body: {
    padding: spacing.lg,
    marginTop: -18,
    backgroundColor: colors.cream,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  category: {
    fontFamily: fonts.extraBold,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.pinkDark,
  },
  name: {
    fontFamily: fonts.extraBold,
    fontSize: 28,
    color: colors.ink,
    marginTop: 8,
    lineHeight: 32,
    letterSpacing: -0.4,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    marginBottom: 14,
  },
  price: {
    fontFamily: fonts.extraBold,
    fontSize: 24,
    color: colors.pink,
  },
  mrp: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.muted,
    textDecorationLine: 'line-through',
  },
  offBadge: {
    backgroundColor: colors.pinkMist,
    borderRadius: radii.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  offText: {
    fontFamily: fonts.extraBold,
    fontSize: 11,
    color: colors.pinkDark,
  },
  desc: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 22,
    color: colors.ink,
    marginBottom: 14,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.lg,
  },
  tag: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.ink,
    borderWidth: 1,
    borderColor: colors.softBorder,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.white,
  },
  learnBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.pinkSoft,
    borderRadius: radii.lg,
    padding: 16,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.softBorder,
  },
  learnIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  learnIconText: {
    color: colors.white,
    fontFamily: fonts.extraBold,
  },
  learnBody: {
    flex: 1,
  },
  learnEyebrow: {
    fontFamily: fonts.extraBold,
    fontSize: 9,
    letterSpacing: 2,
    color: colors.pink,
  },
  learnTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 15,
    color: colors.ink,
    marginTop: 2,
  },
  learnMeta: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  learnArrow: {
    fontFamily: fonts.extraBold,
    fontSize: 16,
    color: colors.pink,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingBottom: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.softBorder,
    marginBottom: spacing.md,
  },
  qtyLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.muted,
  },
  qtyControl: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.softBorder,
    borderRadius: radii.sm,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  qtyBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnDisabled: {
    opacity: 0.35,
  },
  stockHint: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    marginBottom: spacing.md,
  },
  oosBanner: {
    borderWidth: 1,
    borderColor: colors.softBorder,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  oosText: {
    fontFamily: fonts.extraBold,
    fontSize: 12,
    letterSpacing: 1.5,
    color: colors.ink,
  },
  qtyBtnText: {
    fontFamily: fonts.extraBold,
    fontSize: 16,
    color: colors.ink,
  },
  qtyValue: {
    width: 40,
    textAlign: 'center',
    fontFamily: fonts.extraBold,
    fontSize: 14,
    color: colors.ink,
  },
  addBtn: {
    backgroundColor: colors.pink,
    borderRadius: radii.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  addBtnText: {
    fontFamily: fonts.extraBold,
    fontSize: 15,
    color: colors.white,
  },
  buyBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.pinkDark,
    borderRadius: radii.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buyBtnText: {
    fontFamily: fonts.extraBold,
    fontSize: 15,
    color: colors.white,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  successBanner: {
    marginTop: spacing.md,
    backgroundColor: '#f3f8f4',
    borderWidth: 1,
    borderColor: '#d5e8db',
    borderRadius: radii.md,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  successText: {
    flex: 1,
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.success,
  },
  successLink: {
    fontFamily: fonts.extraBold,
    fontSize: 12,
    color: colors.pink,
  },
  errorBanner: {
    marginTop: spacing.sm,
    backgroundColor: '#fff5f5',
    borderWidth: 1,
    borderColor: '#f0d0d0',
    borderRadius: radii.md,
    padding: 12,
  },
  errorText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.danger,
  },
});
