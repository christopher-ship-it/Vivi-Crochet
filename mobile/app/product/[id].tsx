import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getProduct } from '../../src/api/products';
import { ApiClientError } from '../../src/api/client';
import { useCart } from '../../src/cart/CartContext';
import { canIncreaseQuantity, isOutOfStock } from '../../src/cart/stock';
import { BrandWordmark } from '../../src/components/BrandWordmark';
import { LearnThisModal } from '../../src/components/LearnThisModal';
import { ErrorView, LoadingView } from '../../src/components/StateViews';
import type { Product } from '../../src/types';
import { colors, fonts, radii, spacing } from '../../src/theme';
import { formatInr } from '../../src/utils/format';
import { LEARN_PROMPT_DELAY_MS } from '../../src/utils/learnPromptTimer';
import { useWishlist } from '../../src/wishlist/WishlistContext';

const SCREEN_WIDTH = Dimensions.get('window').width;
/** Compact product gallery so title, price, and CTAs stay closer to first view. */
const GALLERY_HEIGHT = Math.round(SCREEN_WIDTH * 0.72);
const DESC_PREVIEW_CHARS = 140;

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const galleryRef = useRef<ScrollView>(null);
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
  const [descExpanded, setDescExpanded] = useState(false);
  const { addProduct, setCartToProduct } = useCart();
  const { isWishlisted, toggleWishlist } = useWishlist();
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
      setDescExpanded(false);
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
    galleryRef.current?.scrollTo({ x: 0, animated: false });
  }, [galleryUrls]);

  if (loading) return <LoadingView message="Loading product…" />;
  if (error || !product) {
    return <ErrorView message={error ?? 'Product not found.'} onRetry={load} />;
  }

  const discount =
    product.mrp && product.mrp > product.price
      ? Math.round(((product.mrp - product.price) / product.mrp) * 100)
      : null;
  const course = product.linkedCourse;
  const stock = product.availableStock ?? 0;
  const outOfStock = isOutOfStock(stock);
  const atMaxQty = !canIncreaseQuantity(qty, stock);
  const lowStock = stock > 0 && stock <= 5;
  const wishlisted = isWishlisted(product.id);
  const description = product.description?.trim() ?? '';
  const descNeedsMore = description.length > DESC_PREVIEW_CHARS;
  const descShown =
    !descExpanded && descNeedsMore
      ? `${description.slice(0, DESC_PREVIEW_CHARS).trimEnd()}…`
      : description;

  const learnMeta = course
    ? [course.level, `${course.videoCount} lessons`, `from ${formatInr(course.price)}`]
        .filter(Boolean)
        .join(' · ')
    : null;

  function scrollToImage(index: number) {
    const next = Math.max(0, Math.min(galleryUrls.length - 1, index));
    setActiveImage(next);
    galleryRef.current?.scrollTo({ x: next * SCREEN_WIDTH, animated: true });
  }

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

  async function handleWishlist() {
    const added = await toggleWishlist(product.id);
    if (added && outOfStock) {
      Alert.alert(
        'Saved to wishlist',
        'We will let you know when this product is available.',
      );
    }
  }

  function dismissLearnPrompt() {
    setLearnModalVisible(false);
    setLearnDismissed(true);
    clearLearnTimer();
  }

  async function handleShare() {
    if (!product) return;
    try {
      await Share.share({
        message: `${product.name} — ${formatInr(product.price)} · VIVI Crochet`,
      });
    } catch {
      // User cancelled or share unavailable.
    }
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
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable
            style={styles.headerBtn}
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace('/(tabs)/shop');
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={22} color={colors.ink} />
          </Pressable>
          <BrandWordmark size="sm" />
          <View style={styles.headerActions}>
            <Pressable
              style={styles.headerBtn}
              onPress={() => void handleWishlist()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
            >
              <Ionicons
                name={wishlisted ? 'heart' : 'heart-outline'}
                size={20}
                color={wishlisted ? colors.pink : colors.ink}
              />
            </Pressable>
            <Pressable
              style={styles.headerBtn}
              onPress={() => void handleShare()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Share product"
            >
              <Ionicons name="share-outline" size={20} color={colors.ink} />
            </Pressable>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.gallery}>
            {galleryUrls.length > 0 ? (
              <>
                <ScrollView
                  ref={galleryRef}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={onGalleryScroll}
                >
                  {galleryUrls.map((url, index) => (
                    <View key={`${url}-${index}`} style={styles.heroSlide}>
                      <Image
                        source={{ uri: url }}
                        style={[styles.heroImage, outOfStock && styles.heroImageDimmed]}
                        resizeMode="contain"
                        accessibilityLabel={`${product.name} image ${index + 1}`}
                      />
                    </View>
                  ))}
                </ScrollView>

                {outOfStock && (
                  <View style={styles.gallerySoldOut} pointerEvents="none">
                    <Text style={styles.gallerySoldOutText}>SOLD OUT</Text>
                  </View>
                )}

                {discount !== null && !outOfStock && (
                  <View style={styles.galleryDiscount}>
                    <Text style={styles.galleryDiscountText}>{discount}% OFF</Text>
                  </View>
                )}

                {galleryUrls.length > 1 && (
                  <>
                    <Pressable
                      style={[styles.navArrow, styles.navArrowLeft]}
                      onPress={() => scrollToImage(activeImage - 1)}
                      disabled={activeImage <= 0}
                      accessibilityRole="button"
                      accessibilityLabel="Previous image"
                    >
                      <Ionicons name="chevron-back" size={18} color={colors.ink} />
                    </Pressable>
                    <Pressable
                      style={[styles.navArrow, styles.navArrowRight]}
                      onPress={() => scrollToImage(activeImage + 1)}
                      disabled={activeImage >= galleryUrls.length - 1}
                      accessibilityRole="button"
                      accessibilityLabel="Next image"
                    >
                      <Ionicons name="chevron-forward" size={18} color={colors.ink} />
                    </Pressable>
                    <View style={styles.counter}>
                      <Text style={styles.counterText}>
                        {activeImage + 1} / {galleryUrls.length}
                      </Text>
                    </View>
                  </>
                )}
              </>
            ) : (
              <View style={[styles.heroSlide, styles.heroFallback]}>
                <Text style={[styles.heroInitial, outOfStock && styles.heroImageDimmed]}>
                  {product.name.charAt(0)}
                </Text>
                {outOfStock ? (
                  <View style={styles.gallerySoldOut} pointerEvents="none">
                    <Text style={styles.gallerySoldOutText}>SOLD OUT</Text>
                  </View>
                ) : null}
              </View>
            )}
          </View>

          {galleryUrls.length > 1 && (
            <View style={styles.thumbsWrap}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.thumbsScroll}
                contentContainerStyle={styles.thumbs}
              >
                {galleryUrls.map((url, index) => {
                  const active = index === activeImage;
                  return (
                    <Pressable
                      key={`thumb-${url}-${index}`}
                      style={[styles.thumb, active && styles.thumbActive]}
                      onPress={() => scrollToImage(index)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`View image ${index + 1}`}
                    >
                      <Image source={{ uri: url }} style={styles.thumbImage} resizeMode="cover" />
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}

          <View style={styles.body}>
            <Text style={styles.category}>{product.category.toUpperCase()}</Text>
            <Text style={styles.name}>{product.name}</Text>
            <Text style={styles.craftAccent}>Made with love</Text>

            <View style={styles.priceRow}>
              <Text style={styles.price}>{formatInr(product.price)}</Text>
              {product.mrp && product.mrp > product.price && (
                <Text style={styles.mrp}>{formatInr(product.mrp)}</Text>
              )}
              {discount !== null && (
                <View style={styles.offBadge}>
                  <Text style={styles.offText}>{discount}% OFF</Text>
                </View>
              )}
            </View>

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

            {description ? (
              <View style={styles.descBlock}>
                <Text style={styles.desc}>{descShown}</Text>
                {descNeedsMore && (
                  <Pressable
                    style={styles.readMoreBtn}
                    onPress={() => setDescExpanded((v) => !v)}
                    hitSlop={6}
                  >
                    <Text style={styles.readMoreText}>
                      {descExpanded ? 'Read less' : 'Read more'}
                    </Text>
                    <Ionicons
                      name={descExpanded ? 'chevron-up' : 'chevron-down'}
                      size={14}
                      color={colors.pink}
                    />
                  </Pressable>
                )}
              </View>
            ) : null}

            <View style={styles.featureRow}>
              <View style={styles.featureCard}>
                <Ionicons name="water-outline" size={12} color={colors.pink} />
                <Text style={styles.featureLabel}>CARE</Text>
                <Text style={styles.featureValue}>{product.spec1?.trim() || 'Hand wash'}</Text>
              </View>
            </View>

            {outOfStock ? (
              <View style={styles.oosBlock}>
                <Pressable
                  style={styles.wishlistCta}
                  onPress={() => void handleWishlist()}
                  accessibilityRole="button"
                  accessibilityLabel={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
                >
                  <Ionicons
                    name={wishlisted ? 'heart' : 'heart-outline'}
                    size={18}
                    color={colors.pink}
                  />
                  <Text style={styles.wishlistCtaText}>
                    {wishlisted ? 'Saved to wishlist' : 'Add to wishlist'}
                  </Text>
                </Pressable>
                <Text style={styles.oosNote}>
                  Add to wishlist we will notify you when this product is available.
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.qtyBlock}>
                  <Text style={styles.qtyLabel}>QUANTITY</Text>
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

                {lowStock && (
                  <Text style={styles.stockHint}>
                    {atMaxQty
                      ? 'Maximum quantity reached · Few stocks left'
                      : 'Few stocks left'}
                  </Text>
                )}

                <View style={styles.actionRow}>
                  <Pressable
                    style={[styles.addBtn, adding && styles.btnDisabled]}
                    onPress={handleAddToCart}
                    disabled={adding}
                  >
                    <Ionicons name="bag-outline" size={16} color={colors.white} />
                    <Text style={styles.addBtnText}>{adding ? 'Adding…' : 'Add to cart'}</Text>
                  </Pressable>

                  <Pressable
                    style={[styles.buyBtn, adding && styles.btnDisabled]}
                    onPress={handleBuyNow}
                    disabled={adding}
                  >
                    <Text style={styles.buyBtnText}>Buy now</Text>
                    <Ionicons name="arrow-forward" size={14} color={colors.pink} />
                  </Pressable>
                </View>
              </>
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
      </View>

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
  root: {
    flex: 1,
    backgroundColor: colors.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.softBorder,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scroll: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  gallery: {
    position: 'relative',
    height: GALLERY_HEIGHT,
    backgroundColor: colors.white,
  },
  heroSlide: {
    width: SCREEN_WIDTH,
    height: GALLERY_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  heroImage: {
    width: SCREEN_WIDTH,
    height: GALLERY_HEIGHT,
  },
  heroImageDimmed: {
    opacity: 0.55,
  },
  gallerySoldOut: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(18, 14, 16, 0.42)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gallerySoldOutText: {
    fontFamily: fonts.extraBold,
    fontSize: 18,
    letterSpacing: 2,
    color: colors.white,
  },
  heroFallback: {
    backgroundColor: colors.pinkMist,
  },
  heroInitial: {
    fontFamily: fonts.extraBold,
    fontSize: 72,
    color: colors.ink,
    opacity: 0.12,
  },
  galleryDiscount: {
    position: 'absolute',
    top: 14,
    right: 14,
    backgroundColor: colors.pink,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  galleryDiscountText: {
    fontFamily: fonts.extraBold,
    fontSize: 11,
    color: colors.white,
  },
  navArrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.softBorder,
  },
  navArrowLeft: {
    left: 12,
  },
  navArrowRight: {
    right: 12,
  },
  counter: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    backgroundColor: 'rgba(34,26,30,0.55)',
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  counterText: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.white,
  },
  thumbsWrap: {
    backgroundColor: colors.canvas,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.softBorder,
  },
  thumbsScroll: {
    height: 76,
  },
  thumbs: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 8,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.white,
  },
  thumbActive: {
    borderColor: colors.pink,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  body: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: colors.canvas,
  },
  category: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    letterSpacing: 1.4,
    color: colors.pink,
  },
  name: {
    fontFamily: fonts.extraBold,
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.4,
    color: colors.ink,
    marginTop: 6,
  },
  craftAccent: {
    fontFamily: fonts.decorative,
    fontSize: 22,
    lineHeight: 28,
    paddingBottom: 4,
    color: colors.pink,
    marginTop: 2,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  price: {
    fontFamily: fonts.extraBold,
    fontSize: 20,
    color: colors.pink,
  },
  mrp: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    textDecorationLine: 'line-through',
  },
  offBadge: {
    backgroundColor: colors.pink,
    borderRadius: radii.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  offText: {
    fontFamily: fonts.extraBold,
    fontSize: 10,
    color: colors.white,
  },
  descBlock: {
    marginTop: 8,
  },
  desc: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.ink,
  },
  readMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  readMoreText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.pink,
  },
  featureRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.pinkSoft,
    borderRadius: radii.sm,
    paddingVertical: 4,
    paddingHorizontal: 8,
    gap: 5,
  },
  featureLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 8,
    letterSpacing: 0.8,
    color: colors.pink,
  },
  featureValue: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.ink,
  },
  qtyBlock: {
    marginTop: spacing.md,
  },
  qtyLabel: {
    fontFamily: fonts.extraBold,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.ink,
    marginBottom: 6,
  },
  qtyControl: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  qtyBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnDisabled: {
    opacity: 0.35,
  },
  qtyBtnText: {
    fontFamily: fonts.extraBold,
    fontSize: 14,
    color: colors.ink,
  },
  qtyValue: {
    minWidth: 28,
    textAlign: 'center',
    fontFamily: fonts.extraBold,
    fontSize: 13,
    color: colors.ink,
  },
  stockHint: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
    marginTop: 6,
  },
  oosBlock: {
    marginTop: spacing.lg,
    gap: 10,
  },
  oosNote: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
    textAlign: 'center',
  },
  wishlistCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.pink,
    backgroundColor: colors.pinkSoft,
    borderRadius: radii.md,
    paddingVertical: 14,
  },
  wishlistCtaText: {
    fontFamily: fonts.extraBold,
    fontSize: 14,
    color: colors.pink,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    marginTop: spacing.lg,
  },
  addBtn: {
    flex: 1,
    backgroundColor: colors.pink,
    borderRadius: radii.md,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  addBtnText: {
    fontFamily: fonts.extraBold,
    fontSize: 13,
    color: colors.white,
  },
  buyBtn: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    borderWidth: 1.5,
    borderColor: colors.pink,
  },
  buyBtnText: {
    fontFamily: fonts.extraBold,
    fontSize: 13,
    color: colors.pink,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  learnBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#e4d4f5',
    borderRadius: radii.sm,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d0bce8',
  },
  learnIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  learnIconText: {
    color: colors.white,
    fontFamily: fonts.extraBold,
    fontSize: 11,
  },
  learnBody: {
    flex: 1,
  },
  learnEyebrow: {
    fontFamily: fonts.extraBold,
    fontSize: 8,
    letterSpacing: 1.4,
    color: colors.pink,
  },
  learnTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 13,
    color: colors.ink,
    marginTop: 1,
  },
  learnMeta: {
    fontFamily: fonts.regular,
    fontSize: 10,
    color: colors.muted,
    marginTop: 1,
  },
  learnArrow: {
    fontFamily: fonts.extraBold,
    fontSize: 14,
    color: colors.pink,
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
