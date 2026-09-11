import { Ionicons } from '@expo/vector-icons';
import { Alert, Dimensions, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { isOutOfStock } from '../cart/stock';
import type { Product } from '../types';
import { colors, fonts, radii, spacing } from '../theme';
import { formatInr } from '../utils/format';
import { useWishlist } from '../wishlist/WishlistContext';

const LOW_STOCK_THRESHOLD = 5;
const SCREEN_WIDTH = Dimensions.get('window').width;

/** Shared width for horizontal product rails (Home). Wider than before so
 * rail cards read as compact tiles instead of tall, narrow strips. */
export const RAIL_CARD_WIDTH = Math.min(120, Math.round(SCREEN_WIDTH * 0.3));

/** Gap between cards — use on parent lists, not per-card margins. */
export const PRODUCT_CARD_GAP = spacing.md;

/** Portrait image well (4:5, width:height) for the Shop grid's 2-column cards. */
const IMAGE_ASPECT_RATIO = 4 / 5;

/** Near-square image well for the Home rail — its cards are narrower, so a
 * tall portrait ratio there reads as stretched; square keeps them compact. */
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
}

function getStockLabel(stock: number): string | null {
  if (isOutOfStock(stock)) return 'OUT OF STOCK';
  if (stock <= LOW_STOCK_THRESHOLD) return 'Few stocks left';
  return null;
}

export function ProductCard({
  product,
  index: _index,
  onPress,
  variant = 'grid',
  showStock = false,
}: ProductCardProps) {
  const discount =
    product.mrp && product.mrp > product.price
      ? Math.round(((product.mrp - product.price) / product.mrp) * 100)
      : null;
  const isRail = variant === 'rail';
  // Rail cards (Home's horizontal carousel) need a pixel width up front since
  // they scroll freely. Grid cards (Shop's 2-column list) size from the
  // column's own layout instead of a precomputed screen-width fraction —
  // that JS math was the source of cards coming out stretched/uneven, since
  // it could drift from the FlatList's actual column width. `aspectRatio`
  // lets the image well take whatever width the column gives it and derive
  // a consistent portrait height from that, so it can never look flat.
  const imageHeight = isRail ? imageHeightForWidth(RAIL_CARD_WIDTH, RAIL_IMAGE_ASPECT_RATIO) : null;
  const stock = product.availableStock ?? 0;
  const stockLabel = showStock ? getStockLabel(stock) : null;
  const outOfStock = isOutOfStock(stock);
  const { isWishlisted, toggleWishlist } = useWishlist();
  const wishlisted = isWishlisted(product.id);

  async function handleWishlistPress() {
    const added = await toggleWishlist(product.id);
    if (added && outOfStock) {
      Alert.alert(
        'Saved to wishlist',
        'We will let you know when this product is available.',
      );
    }
  }

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
          isRail
            ? { width: RAIL_CARD_WIDTH, height: imageHeight ?? undefined }
            : styles.imageWellGrid,
        ]}
      >
        {product.imageUrl ? (
          <Image
            source={{ uri: product.imageUrl }}
            style={[
              isRail ? { width: RAIL_CARD_WIDTH, height: imageHeight ?? undefined } : styles.imageFillGrid,
              outOfStock && styles.imageDimmed,
            ]}
            resizeMode="contain"
            accessibilityLabel={product.name}
          />
        ) : (
          <View style={[styles.placeholder, outOfStock && styles.imageDimmed]}>
            <Text style={styles.placeholderMark}>VIVI</Text>
          </View>
        )}
        {outOfStock && (
          <View style={styles.oosOverlay} pointerEvents="none">
            <Text style={styles.oosText}>SOLD OUT</Text>
          </View>
        )}
        <Pressable
          style={[styles.wishBtn, isRail && styles.wishBtnRail]}
          onPress={(event) => {
            // Prevent opening the product when tapping the heart.
            event.stopPropagation?.();
            void handleWishlistPress();
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
        >
          <Ionicons
            name={wishlisted ? 'heart' : 'heart-outline'}
            size={isRail ? 14 : 18}
            color={wishlisted ? colors.pink : colors.ink}
          />
        </Pressable>
        {product.linkedCourse && (
          <View style={styles.learnBadge}>
            <Text style={styles.learnBadgeText}>Learn</Text>
          </View>
        )}
        {!isRail && discount !== null && (
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>{discount}% OFF</Text>
          </View>
        )}
      </View>

      <View style={[styles.body, isRail && styles.bodyRail]}>
        {!isRail && (
          <Text style={styles.category} numberOfLines={1}>
            {product.category.toUpperCase()}
          </Text>
        )}
        <Text style={[styles.name, isRail && styles.nameRail]} numberOfLines={isRail ? 1 : 2}>
          {product.name}
        </Text>
        <View style={[styles.priceRow, isRail && styles.priceRowRail]}>
          <Text style={[styles.price, isRail && styles.priceRail]}>{formatInr(product.price)}</Text>
          {product.mrp && product.mrp > product.price && (
            <Text style={[styles.mrp, isRail && styles.mrpRail]}>{formatInr(product.mrp)}</Text>
          )}
        </View>
        {stockLabel && !outOfStock && !isRail && (
          <Text style={styles.stockLabel}>{stockLabel}</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radii.md,
  },
  cardGrid: {
    // A percentage width inside a `justifyContent: 'space-between'` row
    // (see the Shop screen's columnWrapperStyle) always fits the column
    // exactly, whatever the device's real width turns out to be — no
    // Dimensions-based math to drift out of sync with the actual layout.
    width: '48%',
    alignSelf: 'stretch',
  },
  cardRail: {
    width: RAIL_CARD_WIDTH,
    flexGrow: 0,
    flexShrink: 0,
  },
  cardPressed: {
    opacity: 0.92,
  },
  imageWell: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: colors.canvas,
  },
  imageWellGrid: {
    width: '100%',
    aspectRatio: IMAGE_ASPECT_RATIO,
  },
  imageFillGrid: {
    width: '100%',
    height: '100%',
  },
  imageDimmed: {
    opacity: 0.55,
  },
  placeholder: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.canvas,
  },
  placeholderMark: {
    fontFamily: fonts.extraBold,
    fontSize: 12,
    letterSpacing: 2.4,
    color: colors.muted,
    opacity: 0.45,
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
    top: 8,
    left: 8,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.softBorder,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  learnBadgeText: {
    fontFamily: fonts.semiBold,
    fontSize: 9,
    letterSpacing: 0.4,
    color: colors.pink,
  },
  wishBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.softBorder,
    zIndex: 2,
  },
  wishBtnRail: {
    top: 5,
    right: 5,
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  discountBadge: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    top: undefined,
    backgroundColor: colors.pink,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  discountText: {
    fontFamily: fonts.extraBold,
    fontSize: 9,
    letterSpacing: 0.3,
    color: colors.white,
  },
  body: {
    paddingTop: 8,
    paddingBottom: 10,
    paddingHorizontal: 10,
  },
  bodyRail: {
    paddingTop: 5,
    paddingBottom: 6,
    paddingHorizontal: 6,
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
    // Reserve 2 lines so paired grid cards share one height without the old 3-line gap.
    minHeight: 38,
    color: colors.ink,
  },
  nameRail: {
    fontSize: 11,
    lineHeight: 14,
    minHeight: 14,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
    minHeight: 20,
  },
  priceRowRail: {
    gap: 4,
    marginTop: 3,
    minHeight: 14,
  },
  price: {
    fontFamily: fonts.extraBold,
    fontSize: 15,
    color: colors.pink,
  },
  priceRail: {
    fontSize: 12,
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
  stockLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 9,
    letterSpacing: 0.4,
    marginTop: 6,
    minHeight: 12,
    color: colors.pinkDark,
  },
});
