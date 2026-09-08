import { Dimensions, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { isOutOfStock } from '../cart/stock';
import type { Product } from '../types';
import { colors, fonts, radii, shadows, spacing } from '../theme';
import { formatInr } from '../utils/format';

const PLACEHOLDER_COLORS = ['#ffe3ec', '#fff0f4', '#ffeaf1', '#ffffff', '#ffd0df', '#fff7f9'];
const LOW_STOCK_THRESHOLD = 5;
const SCREEN_WIDTH = Dimensions.get('window').width;

/** Shared width for horizontal product rails (Home). */
export const RAIL_CARD_WIDTH = Math.round(SCREEN_WIDTH * 0.34);

/** Gap between cards — use on parent lists, not per-card margins. */
export const PRODUCT_CARD_GAP = spacing.md;

/**
 * Fixed half-width for Shop grid cards (matches `paddingHorizontal: spacing.lg`
 * on the shop list). Prevents the last odd card from stretching full-bleed.
 */
export const GRID_CARD_WIDTH = Math.floor(
  (SCREEN_WIDTH - spacing.lg * 2 - PRODUCT_CARD_GAP) / 2,
);

/** Portrait image well (4:5) so cards don’t look flat / horizontally stretched. */
const IMAGE_HEIGHT_RATIO = 5 / 4;

function imageHeightForWidth(width: number): number {
  return Math.round(width * IMAGE_HEIGHT_RATIO);
}

interface ProductCardProps {
  product: Product;
  index: number;
  onPress: () => void;
  variant?: 'grid' | 'rail';
  showStock?: boolean;
}

function getStockLabel(stock: number): string | null {
  if (isOutOfStock(stock)) return 'OUT OF STOCK';
  if (stock <= LOW_STOCK_THRESHOLD) return 'Few stocks left';
  return null;
}

export function ProductCard({
  product,
  index,
  onPress,
  variant = 'grid',
  showStock = false,
}: ProductCardProps) {
  const bg = PLACEHOLDER_COLORS[index % PLACEHOLDER_COLORS.length];
  const discount =
    product.mrp && product.mrp > product.price
      ? Math.round(((product.mrp - product.price) / product.mrp) * 100)
      : null;
  const isRail = variant === 'rail';
  const cardWidth = isRail ? RAIL_CARD_WIDTH : GRID_CARD_WIDTH;
  const imageHeight = imageHeightForWidth(cardWidth);
  const stock = product.availableStock ?? 0;
  const stockLabel = showStock ? getStockLabel(stock) : null;
  const outOfStock = showStock && isOutOfStock(stock);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        isRail ? styles.cardRail : styles.cardGrid,
        pressed && styles.cardPressed,
      ]}
      onPress={onPress}
    >
      <View
        style={[
          styles.imageWell,
          { width: cardWidth, height: imageHeight },
          { backgroundColor: product.imageUrl ? colors.canvas : bg },
          outOfStock && styles.imageDimmed,
        ]}
      >
        {product.imageUrl ? (
          <Image
            source={{ uri: product.imageUrl }}
            style={{ width: cardWidth, height: imageHeight }}
            resizeMode="contain"
            accessibilityLabel={product.name}
          />
        ) : (
          <Text style={[styles.initial, isRail && styles.initialRail]}>
            {product.name.charAt(0)}
          </Text>
        )}
        {outOfStock && (
          <View style={styles.oosOverlay}>
            <Text style={styles.oosText}>OUT OF STOCK</Text>
          </View>
        )}
        {product.linkedCourse && (
          <View style={styles.learnBadge}>
            <Text style={styles.learnBadgeText}>Learn</Text>
          </View>
        )}
        {!isRail && discount !== null && (
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>{discount}% off</Text>
          </View>
        )}
      </View>

      <View style={styles.body}>
        <Text style={styles.category}>{product.category.toUpperCase()}</Text>
        <Text style={styles.name}>{product.name}</Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatInr(product.price)}</Text>
          {product.mrp && product.mrp > product.price && (
            <Text style={styles.mrp}>{formatInr(product.mrp)}</Text>
          )}
        </View>
        {stockLabel && !outOfStock && (
          <Text style={styles.stockLabel}>{stockLabel}</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.softBorder,
    overflow: 'hidden',
    ...shadows.card,
  },
  cardGrid: {
    width: GRID_CARD_WIDTH,
    flexGrow: 0,
    flexShrink: 0,
  },
  cardRail: {
    width: RAIL_CARD_WIDTH,
    flexGrow: 0,
    flexShrink: 0,
  },
  cardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  imageWell: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: colors.canvas,
  },
  imageDimmed: {
    opacity: 0.55,
  },
  initial: {
    fontFamily: fonts.extraBold,
    fontSize: 42,
    color: colors.ink,
    opacity: 0.2,
  },
  initialRail: {
    fontSize: 28,
  },
  oosOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(18, 14, 16, 0.42)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  oosText: {
    fontFamily: fonts.extraBold,
    fontSize: 9,
    letterSpacing: 1.4,
    color: colors.white,
  },
  learnBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: colors.pinkSoft,
    borderRadius: radii.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  learnBadgeText: {
    fontFamily: fonts.extraBold,
    fontSize: 9,
    letterSpacing: 0.8,
    color: colors.pinkDark,
  },
  discountBadge: {
    position: 'absolute',
    left: 10,
    top: 10,
    backgroundColor: colors.pinkMist,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  discountText: {
    fontFamily: fonts.extraBold,
    fontSize: 10,
    color: colors.pinkDark,
  },
  body: {
    paddingHorizontal: spacing.sm + 4,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md - 2,
  },
  category: {
    fontFamily: fonts.extraBold,
    fontSize: 9,
    letterSpacing: 0.6,
    lineHeight: 13,
    color: colors.muted,
    marginBottom: 4,
  },
  name: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: spacing.sm,
  },
  price: {
    fontFamily: fonts.extraBold,
    fontSize: 15,
    color: colors.pink,
  },
  mrp: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
    textDecorationLine: 'line-through',
  },
  stockLabel: {
    fontFamily: fonts.extraBold,
    fontSize: 9,
    letterSpacing: 0.6,
    marginTop: 6,
    color: colors.pinkDark,
  },
});
