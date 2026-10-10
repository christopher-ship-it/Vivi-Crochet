import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  NativeScrollEvent,
  Modal,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { buildShareUrl, shareLink } from '../../src/utils/share';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getProduct } from '../../src/api/products';
import { ApiClientError } from '../../src/api/client';
import { useCart } from '../../src/cart/CartContext';
import { canIncreaseQuantity, isOutOfStock } from '../../src/cart/stock';
import { AppImage, prefetchImages } from '../../src/components/AppImage';
import { ProductImageFrame } from '../../src/components/ProductImageFrame';
import { InStockLabel } from '../../src/components/InStockLabel';
import { BrandWordmark } from '../../src/components/BrandWordmark';
import { BackButton } from '../../src/components/BackButton';
import { LearnThisModal } from '../../src/components/LearnThisModal';
import { ProductVariantPicker } from '../../src/components/ProductVariantPicker';
import { ZoomableImage } from '../../src/components/ZoomableImage';
import { ErrorView, LoadingView } from '../../src/components/StateViews';
import type { Product } from '../../src/types';
import { useI18n } from '../../src/i18n';
import { uiFonts, type UiFonts } from '../../src/i18n/uiFonts';
import { colors, radii, spacing } from '../../src/theme';
import { formatInr } from '../../src/utils/format';
import { usePreferences } from '../../src/preferences/PreferencesContext';
import { LEARN_PROMPT_DELAY_MS } from '../../src/utils/learnPromptTimer';
import { useWishlist } from '../../src/wishlist/WishlistContext';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
/** Compact product gallery so title, price, and CTAs stay closer to first view. */
const GALLERY_HEIGHT = Math.round(SCREEN_WIDTH * 0.72);
/** Inset so product photos aren’t edge-cropped / feel zoomed. */
const IMAGE_SIZE = Math.round(Math.min(SCREEN_WIDTH, GALLERY_HEIGHT) * 0.88);

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, language } = useI18n();
  const fonts = uiFonts(language);
  const styles = useMemo(() => createStyles(fonts), [language]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const galleryRef = useRef<ScrollView>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [learnModalVisible, setLearnModalVisible] = useState(false);
  const [learnDismissed, setLearnDismissed] = useState(false);
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [cartMessage, setCartMessage] = useState<string | null>(null);
  const [cartError, setCartError] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [viewerZoomed, setViewerZoomed] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsTab, setDetailsTab] = useState<'specs' | 'description'>('specs');
  const { addProduct, setCartToProduct, peekItems } = useCart();
  const { market } = usePreferences();
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
      const variants = data.variants ?? [];
      let initialVariantId: string | null = null;
      if (variants.length > 0) {
        const match = variants.find((v) => v.id === data.id)
          ?? variants.find((v) => (v.availableStock ?? 0) > 0)
          ?? variants[0];
        initialVariantId = match.id;
      }
      setSelectedVariantId(initialVariantId);
      setLearnDismissed(false);
      setLearnModalVisible(false);
      setDetailsOpen(false);
      setDetailsTab('specs');
      const stock = initialVariantId
        ? (variants.find((v) => v.id === initialVariantId)?.availableStock ?? 0)
        : (data.availableStock ?? 0);
      setQty(stock > 0 ? 1 : 0);
    } catch (err) {
      setError(t('product.failedLoadFriendly'));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

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

  const selectedVariant = useMemo(() => {
    if (!product?.variants?.length || !selectedVariantId) return null;
    return product.variants.find((v) => v.id === selectedVariantId) ?? product.variants[0];
  }, [product, selectedVariantId]);

  /** Sellable SKU for cart — variant when present, otherwise the product itself. */
  const sellableProduct = useMemo(() => {
    if (!product) return null;
    if (!selectedVariant) return product;
    return {
      ...product,
      id: selectedVariant.id,
      price: selectedVariant.price,
      mrp: selectedVariant.mrp,
      availableStock: selectedVariant.availableStock,
      productCode: selectedVariant.productCode,
      colourName: selectedVariant.colourName,
      colourHex: selectedVariant.colourHex,
      imageUrl: selectedVariant.imageUrl ?? product.imageUrl,
      parentProductId: product.parentProductId ?? product.id,
    } satisfies Product;
  }, [product, selectedVariant]);

  const galleryUrls = useMemo(() => {
    if (!product) return [];
    if (selectedVariant?.imageUrl) return [selectedVariant.imageUrl];
    const fromImages = (product.images ?? [])
      .slice()
      .sort((a, b) => Number(b.isMain) - Number(a.isMain) || a.sortOrder - b.sortOrder)
      .map((i) => i.url)
      .filter(Boolean);
    if (fromImages.length > 0) return fromImages;
    return product.imageUrl ? [product.imageUrl] : [];
  }, [product, selectedVariant]);

  function selectVariant(variantId: string) {
    setSelectedVariantId(variantId);
    const variant = product?.variants?.find((v) => v.id === variantId);
    const stock = variant?.availableStock ?? 0;
    setQty(stock > 0 ? 1 : 0);
    setActiveImage(0);
    galleryRef.current?.scrollTo({ x: 0, animated: false });
  }

  useEffect(() => {
    setActiveImage(0);
    galleryRef.current?.scrollTo({ x: 0, animated: false });
    // Hero first — prefetch siblings after a beat so they don't steal bandwidth.
    if (galleryUrls.length === 0) return;
    prefetchImages([galleryUrls[0]]);
    if (galleryUrls.length === 1) return;
    const timer = setTimeout(() => prefetchImages(galleryUrls.slice(1)), 200);
    return () => clearTimeout(timer);
  }, [galleryUrls]);

  useEffect(() => {
    if (galleryUrls.length <= 1) return;
    prefetchImages([
      galleryUrls[activeImage],
      galleryUrls[activeImage + 1],
      galleryUrls[activeImage - 1],
    ]);
  }, [activeImage, galleryUrls]);

  if (loading) return <LoadingView message={t('product.loadingProduct')} />;
  if (error || !product) {
    return <ErrorView message={error ?? t('product.notFound')} onRetry={load} />;
  }

  const display = sellableProduct ?? product;
  const discount =
    display.mrp && display.mrp > display.price
      ? Math.round(((display.mrp - display.price) / display.mrp) * 100)
      : null;
  const isEssentials = (product.productType ?? 'Handmade') === 'Resell';
  const course = product.linkedCourse;
  const stock = display.availableStock ?? 0;
  const outOfStock = isOutOfStock(stock);
  const atMaxQty = !canIncreaseQuantity(qty, stock);
  const lowStock = stock > 0 && stock <= 5;
  const wishlistId = product.parentProductId ?? product.id;
  const wishlisted = isWishlisted(wishlistId);
  const description = product.description?.trim() ?? '';
  const hasSpecs = Boolean(
    (!isEssentials && display.productCode?.trim()) ||
      product.spec1?.trim() ||
      product.spec2?.trim() ||
      product.ballWeight?.trim() ||
      product.yarnLength?.trim() ||
      product.crochetHookSize?.trim() ||
      product.fibreBlend?.trim() ||
      product.yarnWeight?.trim() ||
      product.needleSize?.trim(),
  );
  const hasDescription = description.length > 0;
  const highlights = [
    { label: t('product.codeLabel'), value: isEssentials ? undefined : display.productCode?.trim() },
    { label: t('product.ballWeightLabel'), value: product.ballWeight?.trim() },
    { label: t('product.yarnLengthLabel'), value: product.yarnLength?.trim() },
    { label: t('product.hookSizeLabel'), value: product.crochetHookSize?.trim() },
    { label: t('product.fibreLabel'), value: product.fibreBlend?.trim() },
    { label: t('product.yarnWeightLabel'), value: product.yarnWeight?.trim() },
    { label: t('product.needleSizeLabel'), value: product.needleSize?.trim() },
  ].filter((h): h is { label: string; value: string } => Boolean(h.value));
  const activeDetailsTab: 'specs' | 'description' =
    detailsTab === 'specs' && !hasSpecs && hasDescription ? 'description' : detailsTab;

  const learnMeta = course
    ? [
        course.level,
        t('product.lessonsCount', { count: course.videoCount }),
        // The linked course price is India-market copy; outside India the course page shows its own price.
        market.canOrderProducts ? t('product.priceFrom', { price: formatInr(course.price) }) : null,
      ]
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
    if (!product) return;
    const added = await toggleWishlist(wishlistId);
    if (added && outOfStock) {
      Alert.alert(
        t('product.savedWishlist'),
        t('product.savedWishlistBody'),
      );
    }
  }

  function dismissLearnPrompt() {
    setLearnModalVisible(false);
    setLearnDismissed(true);
    clearLearnTimer();
  }

  async function handleShare() {
    if (!product || !display) return;
    try {
      const colourBit = display.colourName ? ` · ${display.colourName}` : '';
      await shareLink(
        `${product.name}${colourBit} — ${formatInr(display.price)} · VIVI Crochet`,
        buildShareUrl('product', product.id),
      );
    } catch {
      // User cancelled or share unavailable.
    }
  }

  async function handleAddToCart() {
    if (!sellableProduct || outOfStock) return;
    if ((product.variants?.length ?? 0) > 0 && !selectedVariant) {
      setCartError('Choose a colour before adding to cart.');
      return;
    }
    setAdding(true);
    setCartError(null);
    setCartMessage(null);
    try {
      await addProduct(sellableProduct, qty);
      // Show the running total too: adding a second colour says "Added 1", but the cart now holds 2.
      const total = peekItems().reduce((sum, line) => sum + line.quantity, 0);
      setCartMessage(
        total > qty
          ? `Added ${qty} to your cart · ${total} items in cart`
          : `Added ${qty} to your cart.`,
      );
    } catch (err) {
      setCartError(err instanceof Error ? err.message : 'Could not add to cart.');
    } finally {
      setAdding(false);
    }
  }

  async function handleBuyNow() {
    if (!sellableProduct || outOfStock) return;
    if ((product.variants?.length ?? 0) > 0 && !selectedVariant) {
      setCartError('Choose a colour before buying.');
      return;
    }
    setAdding(true);
    setCartError(null);
    setCartMessage(null);
    try {
      await setCartToProduct(sellableProduct, qty);
      router.push('/cart');
    } catch (err) {
      setCartError(err instanceof Error ? err.message : 'Could not update cart.');
      setAdding(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.root}>
        <View style={[styles.headerBar, { paddingTop: insets.top }]}>
          <View style={styles.header}>
            <View style={styles.headerSide}>
              <BackButton fallbackHref="/(tabs)/shop" />
            </View>
            <View style={styles.headerBrand} pointerEvents="none">
              <BrandWordmark size="sm" />
            </View>
            <View style={[styles.headerSide, styles.headerActions]}>
              <Pressable
                style={styles.headerBtn}
                onPress={() => void handleWishlist()}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={
                  wishlisted ? t('product.removeWishlist') : t('product.addWishlist')
                }
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
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{
            // Leave room so specs/description aren't hidden under the sticky cart bar.
            paddingBottom: outOfStock || !market.canOrderProducts ? 28 : 200,
          }}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          <View style={styles.gallery}>
            {galleryUrls.length > 0 ? (
              <>
                <ScrollView
                  ref={galleryRef}
                  horizontal
                  pagingEnabled
                  nestedScrollEnabled
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={onGalleryScroll}
                >
                  {galleryUrls.map((url, index) => {
                    // Only decode nearby slides — mounting every gallery image
                    // at once delayed the first (hero) paint.
                    const shouldLoad = Math.abs(index - activeImage) <= 1;
                    return (
                      <Pressable
                        key={`${url}-${index}`}
                        style={styles.heroSlide}
                        onPress={() => setViewerIndex(index)}
                        accessibilityRole="imagebutton"
                        accessibilityLabel={`View ${product.name} image ${index + 1} full screen`}
                      >
                        {shouldLoad ? (
                          <ProductImageFrame
                            uri={url}
                            style={styles.heroFrame}
                            imageStyle={[styles.heroImage, outOfStock && styles.heroImageDimmed]}
                            contentFit="contain"
                            contentPadding={0}
                            priority={index === activeImage ? 'high' : 'low'}
                            recyclingKey={url}
                            accessibilityLabel={`${product.name} image ${index + 1}`}
                            placeholderMark={product.name.charAt(0).toUpperCase() || 'V'}
                            placeholderSize="hero"
                          />
                        ) : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {outOfStock && (
                  <View style={styles.gallerySoldOut} pointerEvents="none">
                    <Text style={styles.gallerySoldOutText}>{t('product.soldOut')}</Text>
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
              <ProductImageFrame
                style={[styles.heroSlide, styles.heroFallback]}
                uri={null}
                placeholderMark={product.name.charAt(0).toUpperCase() || 'V'}
                placeholderSize="hero"
                dimmed={outOfStock}
                contentPadding={0}
              >
                {outOfStock ? (
                  <View style={styles.gallerySoldOut} pointerEvents="none">
                    <Text style={styles.gallerySoldOutText}>{t('product.soldOut')}</Text>
                  </View>
                ) : null}
              </ProductImageFrame>
            )}
          </View>

          {galleryUrls.length > 1 && (
            <View style={styles.thumbsWrap}>
              <ScrollView
                horizontal
                nestedScrollEnabled
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
                      <AppImage
                        uri={url}
                        style={styles.thumbImage}
                        contentFit="cover"
                        priority="low"
                        transition={0}
                        recyclingKey={`thumb-${url}`}
                      />
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}

          <View style={[styles.body, isEssentials && styles.bodyCompact]}>
            <Text style={styles.category}>{product.category.toUpperCase()}</Text>
            <Text style={[styles.name, isEssentials && styles.nameCompact]}>{product.name}</Text>

            <View style={[styles.priceRow, isEssentials && styles.priceRowCompact]}>
              <Text style={[styles.price, isEssentials && styles.priceCompact]}>
                {formatInr(display.price)}
              </Text>
              {display.mrp && display.mrp > display.price ? (
                <Text style={styles.mrp}>{formatInr(display.mrp)}</Text>
              ) : null}
              {discount !== null ? (
                <Text style={styles.offTextInline}>{discount}% OFF</Text>
              ) : null}
            </View>

            {isEssentials ? (
              <Text style={[styles.deliveryHint, styles.deliveryHintCompact]}>
                {t('product.essentialsDeliveryHint')}
              </Text>
            ) : null}

            {isEssentials && !outOfStock ? <InStockLabel compact /> : null}

            {(product.variants?.length ?? 0) > 0 && selectedVariantId ? (
              <ProductVariantPicker
                product={product}
                selectedId={selectedVariantId}
                onSelect={selectVariant}
              />
            ) : null}

            {course ? (
              <Pressable style={styles.learnBanner} onPress={goToCourse}>
                <View style={styles.learnIcon}>
                  <Ionicons name="play" size={12} color={colors.white} />
                </View>
                <View style={styles.learnBody}>
                  <Text style={styles.learnEyebrow}>LEARN THIS</Text>
                  <Text style={styles.learnTitle}>Course available for this piece</Text>
                  {learnMeta ? <Text style={styles.learnMeta}>{learnMeta}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.pink} />
              </Pressable>
            ) : null}

            {hasSpecs || hasDescription ? (
              <View style={styles.detailsBlock}>
                <Pressable
                  style={styles.detailsHeader}
                  onPress={() => setDetailsOpen((v) => !v)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: detailsOpen }}
                >
                  <Text style={styles.detailsTitle}>{t('product.productDetails')}</Text>
                  <View style={styles.detailsChevron}>
                    <Ionicons
                      name={detailsOpen ? 'chevron-up' : 'chevron-down'}
                      size={20}
                      color={colors.ink}
                    />
                  </View>
                </Pressable>
                {detailsOpen ? (
                  <View>
                    {highlights.length > 0 ? (
                      <View style={styles.highlightGrid}>
                        {highlights.map((h) => (
                          <View key={h.label} style={styles.highlightCell}>
                            <Text style={styles.detailKey}>{h.label}</Text>
                            <Text style={styles.detailValue}>{h.value}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    <View style={styles.detailsTabs}>
                      {hasSpecs ? (
                        <Pressable
                          style={[styles.detailsTab, activeDetailsTab === 'specs' && styles.detailsTabActive]}
                          onPress={() => setDetailsTab('specs')}
                        >
                          <Text
                            style={[
                              styles.detailsTabText,
                              activeDetailsTab === 'specs' && styles.detailsTabTextActive,
                            ]}
                          >
                            Specifications
                          </Text>
                        </Pressable>
                      ) : null}
                      {hasDescription ? (
                        <Pressable
                          style={[
                            styles.detailsTab,
                            activeDetailsTab === 'description' && styles.detailsTabActive,
                          ]}
                          onPress={() => setDetailsTab('description')}
                        >
                          <Text
                            style={[
                              styles.detailsTabText,
                              activeDetailsTab === 'description' && styles.detailsTabTextActive,
                            ]}
                          >
                            Description
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                    {activeDetailsTab === 'specs' ? (
                      <View>
                {!isEssentials && display.productCode?.trim() ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailKey}>{t('product.codeLabel')}</Text>
                    <Text style={styles.detailValue}>{display.productCode.trim()}</Text>
                  </View>
                ) : null}
                {product.spec1?.trim() ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailValue}>{product.spec1.trim()}</Text>
                  </View>
                ) : null}
                {product.spec2?.trim() ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailValue}>{product.spec2.trim()}</Text>
                  </View>
                ) : null}
                {product.ballWeight?.trim() ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailKey}>{t('product.ballWeightLabel')}</Text>
                    <Text style={styles.detailValue}>{product.ballWeight.trim()}</Text>
                  </View>
                ) : null}
                {product.yarnLength?.trim() ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailKey}>{t('product.yarnLengthLabel')}</Text>
                    <Text style={styles.detailValue}>{product.yarnLength.trim()}</Text>
                  </View>
                ) : null}
                {product.crochetHookSize?.trim() ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailKey}>{t('product.hookSizeLabel')}</Text>
                    <Text style={styles.detailValue}>{product.crochetHookSize.trim()}</Text>
                  </View>
                ) : null}
                {product.fibreBlend?.trim() ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailKey}>{t('product.fibreLabel')}</Text>
                    <Text style={styles.detailValue}>{product.fibreBlend.trim()}</Text>
                  </View>
                ) : null}
                {product.yarnWeight?.trim() ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailKey}>{t('product.yarnWeightLabel')}</Text>
                    <Text style={styles.detailValue}>{product.yarnWeight.trim()}</Text>
                  </View>
                ) : null}
                {product.needleSize?.trim() ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailKey}>{t('product.needleSizeLabel')}</Text>
                    <Text style={styles.detailValue}>{product.needleSize.trim()}</Text>
                  </View>
                ) : null}
                      </View>
                    ) : (
                      <Text style={[styles.desc, isEssentials && styles.descCompact]}>{description}</Text>
                    )}
                  </View>
                ) : null}
              </View>
            ) : null}

            {!isEssentials ? (
              <View style={styles.featureRow}>
                <View style={styles.featureCard}>
                  <Ionicons name="water-outline" size={16} color={colors.pink} />
                  <View style={styles.featureCopy}>
                    <Text style={styles.featureLabel}>{t('product.careLabel')}</Text>
                    <Text style={styles.featureValue}>{t('product.handWashOnly')}</Text>
                  </View>
                </View>
                <View style={styles.featureCard}>
                  <Ionicons name="close-circle-outline" size={16} color={colors.pink} />
                  <View style={styles.featureCopy}>
                    <Text style={styles.featureLabel}>{t('product.returnsLabel')}</Text>
                    <Text style={styles.featureValue}>{t('product.noReturns')}</Text>
                  </View>
                </View>
              </View>
            ) : null}

            {outOfStock ? (
              <View style={styles.oosBlock}>
                <Pressable
                  style={styles.wishlistCta}
                  onPress={() => void handleWishlist()}
                  accessibilityRole="button"
                  accessibilityLabel={
                  wishlisted ? t('product.removeWishlist') : t('product.addWishlist')
                }
                >
                  <Ionicons
                    name={wishlisted ? 'heart' : 'heart-outline'}
                    size={18}
                    color={colors.pink}
                  />
                  <Text style={styles.wishlistCtaText}>
                    {wishlisted ? t('product.savedWishlistShort') : t('product.addWishlist')}
                  </Text>
                </Pressable>
                <Text style={styles.oosNote}>
                  We’ll notify you when this piece is back in stock.
                </Text>
              </View>
            ) : null}
          </View>
        </ScrollView>

        {!market.canOrderProducts ? (
          <View style={[styles.stickyBar, { paddingBottom: Math.max(insets.bottom, 8) + 12, paddingTop: 12 }]}>
            <Text style={styles.indiaOnlyNote}>{t('market.productsIndiaOnly')}</Text>
          </View>
        ) : !outOfStock ? (
          <View style={[styles.stickyBar, { paddingBottom: Math.max(insets.bottom, 8) + 4 }]}>
            {cartMessage ? (
              <View style={styles.successBanner}>
                <Text style={styles.successText}>{cartMessage}</Text>
                <Pressable onPress={() => router.push('/cart')}>
                  <Text style={styles.successLink}>View cart →</Text>
                </Pressable>
              </View>
            ) : null}

            {cartError ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{cartError}</Text>
              </View>
            ) : null}
            <View style={[styles.qtyBlock, isEssentials && styles.qtyBlockCompact]}>
              <Text style={[styles.qtyLabel, isEssentials && styles.sectionLabelCompact]}>
                {t('product.quantity')}
              </Text>
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

            {lowStock ? (
              <Text style={styles.stockHint}>
                {atMaxQty
                  ? 'Maximum quantity reached · Few left'
                  : 'Few pieces left'}
              </Text>
            ) : null}

            <View style={styles.actionRow}>
              <Pressable
                style={[styles.addBtn, adding && styles.btnDisabled]}
                onPress={handleAddToCart}
                disabled={adding}
              >
                <Ionicons name="bag-outline" size={16} color={colors.white} />
                <Text style={styles.addBtnText}>
                  {adding ? t('product.adding') : t('product.addToCart')}
                </Text>
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
          </View>
        ) : null}
      </View>

      <Modal
        visible={viewerIndex !== null}
        transparent={false}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setViewerIndex(null)}
        onShow={() => setViewerZoomed(false)}
      >
        <GestureHandlerRootView style={styles.viewerRoot}>
          {viewerIndex !== null ? (
            <ScrollView
              horizontal
              pagingEnabled
              scrollEnabled={!viewerZoomed}
              showsHorizontalScrollIndicator={false}
              contentOffset={{ x: viewerIndex * SCREEN_WIDTH, y: 0 }}
              onMomentumScrollEnd={(e) =>
                setViewerIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH))
              }
            >
              {galleryUrls.map((url, index) => (
                <ZoomableImage
                  key={`viewer-${url}-${index}`}
                  uri={url}
                  width={SCREEN_WIDTH}
                  height={SCREEN_HEIGHT}
                  active={index === viewerIndex}
                  onTap={() => setViewerIndex(null)}
                  onZoomChange={setViewerZoomed}
                  accessibilityLabel={`${product.name} image ${index + 1}`}
                />
              ))}
            </ScrollView>
          ) : null}
          <Pressable
            style={[styles.viewerClose, { top: insets.top + 12 }]}
            onPress={() => setViewerIndex(null)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close image"
          >
            <Ionicons name="close" size={24} color={colors.white} />
          </Pressable>
          {galleryUrls.length > 1 && viewerIndex !== null ? (
            <Text style={[styles.viewerCounter, { bottom: insets.bottom + 20 }]}>
              {viewerIndex + 1} / {galleryUrls.length}
            </Text>
          ) : null}
        </GestureHandlerRootView>
      </Modal>

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

function createStyles(fonts: UiFonts) {
  return StyleSheet.create({
  viewerRoot: {
    flex: 1,
    backgroundColor: '#000',
  },
  viewerSlide: {
    width: SCREEN_WIDTH,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: {
    width: SCREEN_WIDTH,
    height: '100%',
  },
  viewerClose: {
    position: 'absolute',
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerCounter: {
    position: 'absolute',
    alignSelf: 'center',
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.white,
  },
  root: {
    flex: 1,
    backgroundColor: colors.shopCanvas,
  },
  headerBar: {
    backgroundColor: colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.softBorder,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    position: 'relative',
  },
  headerBrand: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSide: {
    minWidth: 80,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActions: {
    justifyContent: 'flex-end',
  },
  scroll: {
    flex: 1,
    backgroundColor: colors.shopCanvas,
  },
  gallery: {
    position: 'relative',
    height: GALLERY_HEIGHT,
    backgroundColor: colors.cottonBase,
  },
  heroSlide: {
    width: SCREEN_WIDTH,
    height: GALLERY_HEIGHT,
    backgroundColor: colors.cottonBase,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroFrame: {
    width: SCREEN_WIDTH,
    height: GALLERY_HEIGHT,
  },
  heroImage: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
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
  heroFallback: {},
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
    backgroundColor: 'transparent',
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
    backgroundColor: colors.cottonBase,
  },
  thumbActive: {
    borderColor: colors.pink,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: colors.shopCanvas,
  },
  bodyCompact: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  category: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    letterSpacing: 1.4,
    color: colors.muted,
  },
  name: {
    fontFamily: fonts.extraBold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.5,
    color: colors.ink,
    marginTop: 8,
  },
  nameCompact: {
    fontSize: 22,
    lineHeight: 28,
    marginTop: 4,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  priceRowCompact: {
    marginTop: 6,
    gap: 6,
  },
  price: {
    fontFamily: fonts.extraBold,
    fontSize: 24,
    color: colors.ink,
  },
  priceCompact: {
    fontSize: 20,
  },
  mrp: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.muted,
    textDecorationLine: 'line-through',
  },
  offBadge: {
    backgroundColor: colors.pinkSoft,
    borderRadius: 2,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  offText: {
    fontFamily: fonts.extraBold,
    fontSize: 11,
    color: colors.pink,
  },
  offTextInline: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.pink,
  },
  deliveryHint: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.pink,
    marginTop: 8,
  },
  deliveryHintCompact: {
    marginTop: 4,
  },
  sectionLabel: {
    fontFamily: fonts.extraBold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.muted,
    marginBottom: 8,
  },
  sectionLabelCompact: {
    marginBottom: 4,
  },
  desc: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 23,
    color: colors.ink,
  },
  descCompact: {
    fontSize: 14,
    lineHeight: 20,
  },
  detailsBlock: {
    marginTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  detailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  detailsTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 18,
    color: colors.ink,
  },
  detailsChevron: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#f3f3f3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  highlightGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 14,
  },
  highlightCell: {
    width: '50%',
    paddingRight: 12,
    paddingVertical: 8,
    gap: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  detailsTabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  detailsTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  detailsTabActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  detailsTabText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.ink,
  },
  detailsTabTextActive: {
    color: colors.white,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  detailKey: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.muted,
  },
  detailValue: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.ink,
    flexShrink: 1,
  },
  featureRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: spacing.md,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.softBorder,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
  },
  featureCopy: {
    gap: 2,
  },
  featureLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  featureValue: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.ink,
  },
  indiaOnlyNote: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    lineHeight: 19,
    color: colors.pinkDark,
    textAlign: 'center',
  },
  stickyBar: {
    backgroundColor: colors.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.softBorder,
    paddingHorizontal: spacing.md,
    paddingTop: 6,
  },
  qtyBlock: {
    marginTop: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  qtyBlockCompact: {
    marginTop: spacing.sm,
  },
  qtyLabel: {
    fontFamily: fonts.extraBold,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.muted,
    marginBottom: 0,
  },
  qtyControl: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  qtyBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnDisabled: {
    opacity: 0.35,
  },
  qtyBtnText: {
    fontFamily: fonts.extraBold,
    fontSize: 16,
    color: colors.ink,
  },
  qtyValue: {
    minWidth: 30,
    textAlign: 'center',
    fontFamily: fonts.extraBold,
    fontSize: 14,
    color: colors.ink,
  },
  stockHint: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    marginTop: 8,
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
    marginTop: 6,
  },
  addBtn: {
    flex: 1.15,
    backgroundColor: colors.pink,
    borderRadius: radii.md,
    paddingVertical: 10,
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
    paddingVertical: 9,
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
    gap: 10,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginTop: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.softBorder,
  },
  learnIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  learnBody: {
    flex: 1,
  },
  learnEyebrow: {
    fontFamily: fonts.extraBold,
    fontSize: 9,
    letterSpacing: 1.2,
    color: colors.pink,
  },
  learnTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 14,
    color: colors.ink,
    marginTop: 2,
  },
  learnMeta: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  successBanner: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    backgroundColor: '#f3f8f4',
    borderWidth: 1,
    borderColor: '#d5e8db',
    borderRadius: radii.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
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
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
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
}
