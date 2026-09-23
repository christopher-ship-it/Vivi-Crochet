import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Dimensions, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { isOutOfStock } from '../cart/stock';
import { useI18n } from '../i18n';
import { uiFonts, type UiFonts } from '../i18n/uiFonts';
import type { Product } from '../types';
import { colors, spacing } from '../theme';
import { formatInr } from '../utils/format';
import { useWishlist } from '../wishlist/WishlistContext';
import { ProductImageFrame } from './ProductImageFrame';
import { InStockLabel } from './InStockLabel';

const SCREEN_WIDTH = Dimensions.get('window').width;

/** Shared width for horizontal product rails (Home). */
export const RAIL_CARD_WIDTH = Math.min(120, Math.round(SCREEN_WIDTH * 0.3));

/** Gap between cards — use on parent lists, not per-card margins. */
export const PRODUCT_CARD_GAP = spacing.md;

/** Square image well — matches product photo normalize (1200×1200). */
const IMAGE_ASPECT_RATIO = 1;
const RAIL_IMAGE_ASPECT_RATIO = 1;

function imageHeightForWidth(width: number, ratio: number): number {
  return Math.round(width / ratio);
}

interface ProductCardProps {
  product: Product;
  index: number;
  onPress: () => void;
  variant?: 'grid' | 'rail';
  showStock?: boolean;
  /** Shorter grid card — used for crochet essentials. */
  compact?: boolean;
}

export function ProductCard({
  product,
  index: _index,
  onPress,
  variant = 'grid',
  showStock = false,
  compact = false,
}: ProductCardProps) {
  const router = useRouter();
  const { t, language } = useI18n();
  const fonts = uiFonts(language);
  const styles = useMemo(() => createStyles(fonts), [language]);

  const discount =
    product.mrp && product.mrp > product.price
      ? Math.round(((product.mrp - product.price) / product.mrp) * 100)
      : null;
  const isRail = variant === 'rail';
  const imageHeight = isRail ? imageHeightForWidth(RAIL_CARD_WIDTH, RAIL_IMAGE_ASPECT_RATIO) : null;
  const stock = product.availableStock ?? 0;
  const outOfStock = isOutOfStock(stock);
  const showInStock = showStock && !outOfStock;
  const { isWishlisted, toggleWishlist } = useWishlist();
  const wishlisted = isWishlisted(product.id);
  const courseId = product.linkedCourse?.id;

  async function handleWishlistPress() {
    const added = await toggleWishlist(product.id);
    if (added && outOfStock) {
      Alert.alert(t('product.savedWishlist'), t('product.savedWishlistBody'));
    }
  }

  function handleLearnPress() {
    if (!courseId) return;
    router.push(`/course/${courseId}`);
  }

  const imageBlock = (
    <ProductImageFrame
      uri={product.imageUrl}
      style={[
        styles.imageWell,
        isRail
          ? { width: RAIL_CARD_WIDTH, height: imageHeight ?? undefined }
          : compact
            ? styles.imageWellCompact
            : styles.imageWellGrid,
      ]}
      imageStyle={styles.imageFill}
      contentFit="contain"
      contentPadding={isRail ? 6 : compact ? 6 : 10}
      dimmed={outOfStock}
      recyclingKey={product.id}
      priority={isRail ? 'normal' : 'high'}
      accessibilityLabel={product.name}
    >
      {outOfStock && (
        <View style={styles.oosOverlay} pointerEvents="none">
          <Text style={styles.oosText}>{t('productCard.soldOut')}</Text>
        </View>
      )}
      <Pressable
        style={[styles.wishBtn, isRail && styles.wishBtnRail, compact && styles.wishBtnCompact]}
        onPress={() => {
          void handleWishlistPress();
        }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={
          wishlisted ? t('productCard.removeWishlist') : t('productCard.addWishlist')
        }
      >
        <Ionicons
          name={wishlisted ? 'heart' : 'heart-outline'}
          size={isRail || compact ? 14 : 16}
          color={wishlisted ? colors.pink : colors.ink}
        />
      </Pressable>
      {courseId && !compact ? (
        <Pressable
          style={styles.learnBadge}
          onPress={handleLearnPress}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={t('productCard.learn')}
        >
          <Text style={styles.learnBadgeText}>{t('productCard.learn').toUpperCase()}</Text>
        </Pressable>
      ) : null}
    </ProductImageFrame>
  );

  const infoBlock = (
    <View style={[styles.body, isRail && styles.bodyRail, compact && styles.bodyCompact]}>
      {!isRail && !compact && (
        <Text style={styles.category} numberOfLines={1}>
          {product.category.toUpperCase()}
        </Text>
      )}
      <Text
        style={[styles.name, isRail && styles.nameRail, compact && styles.nameCompact]}
        numberOfLines={isRail || compact ? 2 : 3}
      >
        {product.name}
      </Text>
      <View
        style={[
          styles.priceRow,
          isRail && styles.priceRowRail,
          compact && styles.priceRowCompact,
        ]}
      >
        <Text style={[styles.price, isRail && styles.priceRail, compact && styles.priceCompact]}>
          {formatInr(product.price)}
        </Text>
        {product.mrp && product.mrp > product.price ? (
          <Text style={[styles.mrp, isRail && styles.mrpRail]}>{formatInr(product.mrp)}</Text>
        ) : null}
        {!isRail && discount !== null ? (
          <Text style={styles.discountInline}>
            {t('productCard.percentOff', { percent: discount })}
          </Text>
        ) : null}
      </View>
      {showInStock && !isRail ? <InStockLabel style={compact ? styles.inStockCompact : undefined} /> : null}
    </View>
  );

  const cardInner = (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={product.name}
    >
      {imageBlock}
      {infoBlock}
    </Pressable>
  );

  const glassCard =
    Platform.OS === 'ios' ? (
      <BlurView
        intensity={28}
        tint="light"
        style={[styles.cardGlass, isRail ? styles.cardRail : styles.cardGridFill]}
      >
        {cardInner}
      </BlurView>
    ) : (
      <View
        style={[
          styles.cardGlass,
          styles.cardGlassAndroid,
          isRail ? styles.cardRail : styles.cardGridFill,
        ]}
      >
        {cardInner}
      </View>
    );

  return (
    <View style={isRail ? styles.cardRailOuter : styles.cardGridOuter}>{glassCard}</View>
  );
}

function createStyles(fonts: UiFonts) {
  return StyleSheet.create({
    cardGridOuter: {
      flex: 1,
      maxWidth: '50%',
      alignSelf: 'stretch',
      borderRadius: 14,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255, 255, 255, 0.62)',
      shadowColor: colors.pink,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
      elevation: 3,
    },
    cardGridFill: {
      flex: 1,
      alignSelf: 'stretch',
    },
    cardGlass: {
      backgroundColor: 'rgba(255, 255, 255, 0.28)',
      overflow: 'hidden',
    },
    cardGlassAndroid: {
      backgroundColor: 'rgba(255, 248, 250, 0.82)',
    },
    cardRailOuter: {
      width: RAIL_CARD_WIDTH,
      flexGrow: 0,
      flexShrink: 0,
      borderRadius: 14,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255, 255, 255, 0.55)',
    },
    cardRail: {
      width: RAIL_CARD_WIDTH,
      flexGrow: 0,
      flexShrink: 0,
    },
    cardPressed: {
      opacity: 0.94,
      transform: [{ scale: 0.985 }],
    },
    imageWell: {
      position: 'relative',
      overflow: 'hidden',
    },
    imageWellGrid: {
      width: '100%',
      aspectRatio: IMAGE_ASPECT_RATIO,
    },
    imageWellCompact: {
      width: '100%',
      aspectRatio: 1.22,
    },
    imageFill: {
      width: '100%',
      height: '100%',
    },
    oosOverlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(18, 14, 16, 0.42)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    oosText: {
      fontFamily: fonts.extraBold,
      fontSize: 11,
      letterSpacing: 1.6,
      color: colors.white,
    },
    learnBadge: {
      position: 'absolute',
      bottom: 8,
      left: 8,
      backgroundColor: 'rgba(255,255,255,0.72)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255, 255, 255, 0.85)',
      borderRadius: 10,
      paddingHorizontal: 7,
      paddingVertical: 3,
      zIndex: 2,
      overflow: 'hidden',
    },
    learnBadgeText: {
      fontFamily: fonts.semiBold,
      fontSize: 9,
      letterSpacing: 0.8,
      color: colors.pink,
    },
    wishBtn: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: 'rgba(255,255,255,0.72)',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255, 255, 255, 0.85)',
      zIndex: 2,
    },
    wishBtnRail: {
      top: 5,
      right: 5,
      width: 26,
      height: 26,
      borderRadius: 13,
    },
    wishBtnCompact: {
      top: 6,
      right: 6,
      width: 26,
      height: 26,
      borderRadius: 13,
    },
    body: {
      paddingTop: 10,
      paddingBottom: 12,
      paddingHorizontal: 10,
      gap: 0,
    },
    bodyRail: {
      paddingTop: 5,
      paddingBottom: 6,
      paddingHorizontal: 6,
    },
    bodyCompact: {
      paddingTop: 6,
      paddingBottom: 8,
      paddingHorizontal: 8,
    },
    category: {
      fontFamily: fonts.semiBold,
      fontSize: 9,
      letterSpacing: 1,
      lineHeight: 12,
      color: colors.muted,
      marginBottom: 4,
    },
    name: {
      fontFamily: fonts.semiBold,
      fontSize: 14,
      lineHeight: 19,
      color: colors.ink,
    },
    nameRail: {
      fontSize: 11,
      lineHeight: 14,
    },
    nameCompact: {
      fontSize: 13,
      lineHeight: 17,
    },
    priceRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 8,
    },
    priceRowRail: {
      gap: 4,
      marginTop: 3,
    },
    priceRowCompact: {
      marginTop: 4,
      gap: 5,
    },
    price: {
      fontFamily: fonts.extraBold,
      fontSize: 15,
      color: colors.ink,
    },
    priceRail: {
      fontSize: 12,
      color: colors.pink,
    },
    priceCompact: {
      fontSize: 14,
    },
    mrp: {
      fontFamily: fonts.regular,
      fontSize: 12,
      color: colors.muted,
      textDecorationLine: 'line-through',
    },
    mrpRail: {
      fontSize: 10,
    },
    discountInline: {
      fontFamily: fonts.semiBold,
      fontSize: 10,
      letterSpacing: 0.3,
      color: colors.pink,
    },
    inStockCompact: {
      marginTop: 4,
    },
  });
}
