import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { lineTotal } from '../cart/calculations';
import { canIncreaseQuantity } from '../cart/stock';
import { cartLineColourLabel, isCourseLine, type CartLineItem } from '../cart/types';
import { useI18n } from '../i18n';
import { uiFonts, type UiFonts } from '../i18n/uiFonts';
import { colors } from '../theme';
import { usePreferences } from '../preferences/PreferencesContext';
import { AppImage } from './AppImage';

const PLACEHOLDER_COLORS = ['#ffe3ec', '#f3e8ff', '#fff6d6', '#f7f4f5'];
/** Soft grey behind the product photo and in the delivery strip. */
const WASH = '#f4f2f3';
const WARNING = '#d9531e';

function createStyles(fonts: UiFonts, compact: boolean) {
  const imageSize = compact ? 88 : 96;
  return StyleSheet.create({
    card: {
      padding: 12,
      marginBottom: 10,
      backgroundColor: colors.white,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.softBorder,
    },
    rowAttachBelow: {
      marginBottom: 0,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
    },
    rowUnavailable: {
      opacity: 0.65,
    },
    main: {
      flexDirection: 'row',
      gap: 12,
    },
    // Photo with the quantity stepper attached underneath, as one rounded box.
    imageCol: {
      width: imageSize,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.softBorder,
      overflow: 'hidden',
      backgroundColor: colors.white,
      alignSelf: 'flex-start',
    },
    imageBox: {
      width: '100%',
      height: imageSize,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: WASH,
    },
    thumbImage: {
      width: '100%',
      height: '100%',
    },
    thumbInitial: {
      fontFamily: fonts.extraBold,
      fontSize: compact ? 24 : 30,
      color: colors.ink,
      opacity: 0.22,
    },
    stepper: {
      height: 34,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 4,
    },
    stepBtn: {
      width: 28,
      height: 34,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepBtnDisabled: {
      opacity: 0.3,
    },
    stepBtnText: {
      fontFamily: fonts.extraBold,
      fontSize: 18,
      color: colors.ink,
    },
    stepValue: {
      fontFamily: fonts.extraBold,
      fontSize: 15,
      color: colors.ink,
    },
    info: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    name: {
      fontFamily: fonts.extraBold,
      fontSize: compact ? 14 : 15,
      lineHeight: compact ? 20 : 21,
      color: colors.ink,
    },
    colourRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    colourDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    colourText: {
      flexShrink: 1,
      fontFamily: fonts.semiBold,
      fontSize: 13,
      color: colors.muted,
    },
    category: {
      fontFamily: fonts.regular,
      fontSize: 12,
      color: colors.muted,
    },
    priceRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 4,
    },
    discount: {
      fontFamily: fonts.extraBold,
      fontSize: 13,
      color: colors.success,
    },
    mrp: {
      fontFamily: fonts.semiBold,
      fontSize: 13,
      color: colors.muted,
      textDecorationLine: 'line-through',
    },
    price: {
      fontFamily: fonts.extraBold,
      fontSize: 18,
      color: colors.ink,
    },
    total: {
      fontFamily: fonts.semiBold,
      fontSize: 12,
      color: colors.muted,
    },
    stockCap: {
      fontFamily: fonts.semiBold,
      fontSize: 12,
      color: WARNING,
    },
    unavailable: {
      fontFamily: fonts.semiBold,
      fontSize: 12,
      color: colors.danger,
      marginTop: 4,
    },
    readOnlyQty: {
      fontFamily: fonts.semiBold,
      fontSize: 12,
      color: colors.muted,
    },
    removeBtn: {
      alignSelf: 'flex-start',
      paddingVertical: 4,
      marginTop: 2,
    },
    removeBtnText: {
      fontFamily: fonts.semiBold,
      fontSize: 12,
      color: colors.muted,
    },
    deliveryStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: WASH,
    },
    deliveryText: {
      flex: 1,
      fontFamily: fonts.semiBold,
      fontSize: 13,
      color: colors.ink,
    },
  });
}

interface CartLineRowProps {
  item: CartLineItem;
  index: number;
  unavailable?: boolean;
  readOnly?: boolean;
  /** Flatten bottom corners when a recommendation block follows. */
  attachBelow?: boolean;
  /** Slightly smaller photo for Crochet Materials (Resell) lines. */
  compact?: boolean;
  onIncrease: () => void;
  onDecrease: () => void;
  onRemove?: () => void;
}

export function CartLineRow({
  item,
  index,
  unavailable,
  readOnly,
  attachBelow,
  compact: compactProp,
  onIncrease,
  onDecrease,
  onRemove,
}: CartLineRowProps) {
  const { formatPrice } = usePreferences();
  const { t, language } = useI18n();
  const digital = isCourseLine(item);
  const compact = compactProp ?? (!digital && item.productType === 'Resell');
  const fonts = uiFonts(language);
  const styles = useMemo(() => createStyles(fonts, compact), [language, compact]);

  const bg = PLACEHOLDER_COLORS[index % PLACEHOLDER_COLORS.length];
  const stock = item.availableStock;
  const atMax =
    typeof stock === 'number' ? !canIncreaseQuantity(item.quantity, stock) : false;
  const colourLabel = digital ? null : cartLineColourLabel(item);
  const categoryLabel = digital
    ? item.itemType === 'CourseBundle'
      ? t('cart.courseBundleLabel')
      : t('cart.courseLabel')
    : item.category;
  const discount =
    item.mrp != null && item.mrp > item.price
      ? Math.round(((item.mrp - item.price) / item.mrp) * 100)
      : null;
  const showStepper = !unavailable && !readOnly && !digital;

  return (
    <View
      style={[
        styles.card,
        unavailable && styles.rowUnavailable,
        attachBelow && styles.rowAttachBelow,
      ]}
    >
      <View style={styles.main}>
        <View style={styles.imageCol}>
          <View style={[styles.imageBox, !item.imageUrl && { backgroundColor: bg }]}>
            {item.imageUrl ? (
              <AppImage
                uri={item.imageUrl}
                style={styles.thumbImage}
                contentFit="contain"
                backgroundColor={WASH}
              />
            ) : (
              <Text style={styles.thumbInitial}>{item.name.charAt(0)}</Text>
            )}
          </View>
          {showStepper ? (
            <View style={styles.stepper}>
              <Pressable
                style={styles.stepBtn}
                onPress={onDecrease}
                accessibilityRole="button"
                accessibilityLabel={t('productCard.decreaseQty')}
              >
                <Text style={styles.stepBtnText}>−</Text>
              </Pressable>
              <Text style={styles.stepValue}>{item.quantity}</Text>
              <Pressable
                style={[styles.stepBtn, atMax && styles.stepBtnDisabled]}
                onPress={onIncrease}
                disabled={atMax}
                accessibilityRole="button"
                accessibilityLabel={t('productCard.increaseQty')}
              >
                <Text style={styles.stepBtnText}>+</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={2}>
            {item.name}
          </Text>
          {colourLabel ? (
            <View style={styles.colourRow}>
              {item.colourHex ? <View style={[styles.colourDot, { backgroundColor: item.colourHex }]} /> : null}
              <Text style={styles.colourText} numberOfLines={1}>
                {colourLabel}
              </Text>
            </View>
          ) : categoryLabel ? (
            <Text style={styles.category}>{categoryLabel}</Text>
          ) : null}

          <View style={styles.priceRow}>
            {discount != null ? <Text style={styles.discount}>{`↓${discount}%`}</Text> : null}
            {discount != null ? <Text style={styles.mrp}>{formatPrice(item.mrp!)}</Text> : null}
            <Text style={styles.price}>{formatPrice(item.price)}</Text>
          </View>
          {item.quantity > 1 && !digital ? (
            <Text style={styles.total}>{`${t('cart.qtyShort', { count: item.quantity })} · ${formatPrice(lineTotal(item))}`}</Text>
          ) : null}

          {unavailable ? (
            <Text style={styles.unavailable}>{t('cart.productUnavailable')}</Text>
          ) : digital ? (
            <Text style={styles.readOnlyQty}>{t('cart.digitalAccess')}</Text>
          ) : readOnly ? (
            <Text style={styles.readOnlyQty}>{t('cart.qtyShort', { count: item.quantity })}</Text>
          ) : atMax && typeof stock === 'number' && stock > 0 ? (
            <Text style={styles.stockCap}>{t('cart.maxStockReached')}</Text>
          ) : null}

          {onRemove && !unavailable ? (
            <Pressable style={styles.removeBtn} onPress={onRemove} hitSlop={8}>
              <Text style={styles.removeBtnText}>{t('cart.remove')}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {!digital && !unavailable && item.productType === 'Resell' ? (
        <View style={styles.deliveryStrip}>
          <Ionicons name="car-outline" size={18} color={colors.ink} />
          <Text style={styles.deliveryText} numberOfLines={1}>
            {t('shop.roomEssentialsDelivery')}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
