import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { lineTotal } from '../cart/calculations';
import { canIncreaseQuantity } from '../cart/stock';
import type { CartLineItem } from '../cart/types';
import { useI18n } from '../i18n';
import { uiFonts, type UiFonts } from '../i18n/uiFonts';
import { colors, radii } from '../theme';
import { formatInr } from '../utils/format';
import { AppImage } from './AppImage';

const PLACEHOLDER_COLORS = ['#ffe3ec', '#f3e8ff', '#fff6d6', '#f7f4f5'];

function createStyles(fonts: UiFonts, compact: boolean) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      gap: compact ? 10 : 14,
      padding: compact ? 10 : 14,
      marginBottom: compact ? 8 : 10,
      backgroundColor: colors.white,
      borderRadius: compact ? radii.md : radii.lg,
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
    thumb: {
      width: compact ? 48 : 76,
      height: compact ? 48 : 76,
      borderRadius: compact ? 8 : radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      backgroundColor: colors.mediaWash,
    },
    thumbImage: {
      width: '100%',
      height: '100%',
    },
    thumbInitial: {
      fontFamily: fonts.extraBold,
      fontSize: compact ? 18 : 28,
      color: colors.ink,
      opacity: 0.22,
    },
    body: {
      flex: 1,
      minWidth: 0,
    },
    name: {
      fontFamily: fonts.semiBold,
      fontSize: compact ? 13 : 14,
      color: colors.ink,
      lineHeight: compact ? 16 : 18,
    },
    category: {
      fontFamily: fonts.regular,
      fontSize: compact ? 10 : 11,
      color: colors.muted,
      marginTop: 1,
    },
    unitPrice: {
      fontFamily: fonts.semiBold,
      fontSize: compact ? 11 : 12,
      color: colors.pink,
      marginTop: compact ? 2 : 4,
    },
    qtyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: compact ? 6 : 10,
    },
    qtyControl: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.softBorder,
      borderRadius: compact ? 6 : radii.sm,
      backgroundColor: colors.white,
      overflow: 'hidden',
    },
    qtyBtn: {
      width: compact ? 28 : 34,
      height: compact ? 28 : 34,
      alignItems: 'center',
      justifyContent: 'center',
    },
    qtyBtnDisabled: {
      opacity: 0.35,
    },
    qtyBtnText: {
      fontFamily: fonts.extraBold,
      fontSize: compact ? 14 : 16,
      color: colors.ink,
    },
    qtyValue: {
      width: compact ? 26 : 32,
      textAlign: 'center',
      fontFamily: fonts.extraBold,
      fontSize: compact ? 12 : 13,
      color: colors.ink,
    },
    lineTotal: {
      fontFamily: fonts.extraBold,
      fontSize: compact ? 13 : 15,
      color: colors.ink,
    },
    readOnlyQty: {
      fontFamily: fonts.semiBold,
      fontSize: 12,
      color: colors.muted,
    },
    unavailable: {
      fontFamily: fonts.semiBold,
      fontSize: 12,
      color: colors.danger,
      marginTop: 8,
    },
    removeBtn: {
      alignSelf: 'flex-start',
      marginTop: compact ? 4 : 8,
      paddingVertical: 2,
    },
    removeBtnText: {
      fontFamily: fonts.semiBold,
      fontSize: compact ? 11 : 12,
      color: colors.muted,
    },
    stockCap: {
      fontFamily: fonts.regular,
      fontSize: 10,
      color: colors.muted,
      marginTop: 4,
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
  /** Smaller row for Crochet Essentials (Resell) lines. */
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
  const { t, language } = useI18n();
  const compact = compactProp ?? item.productType === 'Resell';
  const fonts = uiFonts(language);
  const styles = useMemo(() => createStyles(fonts, compact), [language, compact]);

  const bg = PLACEHOLDER_COLORS[index % PLACEHOLDER_COLORS.length];
  const stock = item.availableStock;
  const atMax =
    typeof stock === 'number' ? !canIncreaseQuantity(item.quantity, stock) : false;

  return (
    <View
      style={[
        styles.row,
        unavailable && styles.rowUnavailable,
        attachBelow && styles.rowAttachBelow,
      ]}
    >
      <View style={[styles.thumb, !item.imageUrl && { backgroundColor: bg }]}>
        {item.imageUrl ? (
          <AppImage uri={item.imageUrl} style={styles.thumbImage} contentFit="contain" />
        ) : (
          <Text style={styles.thumbInitial}>{item.name.charAt(0)}</Text>
        )}
      </View>

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={compact ? 1 : 2}>
          {item.name}
        </Text>
        {!compact && item.category ? (
          <Text style={styles.category}>{item.category}</Text>
        ) : null}
        <Text style={styles.unitPrice}>
          {formatInr(item.price)} {t('cart.eachSuffix')}
        </Text>

        {unavailable ? (
          <Text style={styles.unavailable}>{t('cart.productUnavailable')}</Text>
        ) : readOnly ? (
          <View style={styles.qtyRow}>
            <Text style={styles.readOnlyQty}>{t('cart.qtyShort', { count: item.quantity })}</Text>
            <Text style={styles.lineTotal}>{formatInr(lineTotal(item))}</Text>
          </View>
        ) : (
          <>
            <View style={styles.qtyRow}>
              <View style={styles.qtyControl}>
                <Pressable
                  style={styles.qtyBtn}
                  onPress={onDecrease}
                  accessibilityRole="button"
                  accessibilityLabel={t('productCard.decreaseQty')}
                >
                  <Text style={styles.qtyBtnText}>−</Text>
                </Pressable>
                <Text style={styles.qtyValue}>{item.quantity}</Text>
                <Pressable
                  style={[styles.qtyBtn, atMax && styles.qtyBtnDisabled]}
                  onPress={onIncrease}
                  disabled={atMax}
                  accessibilityRole="button"
                  accessibilityLabel={t('productCard.increaseQty')}
                >
                  <Text style={styles.qtyBtnText}>+</Text>
                </Pressable>
              </View>
              <Text style={styles.lineTotal}>{formatInr(lineTotal(item))}</Text>
            </View>
            {atMax && typeof stock === 'number' && stock > 0 ? (
              <Text style={styles.stockCap}>{t('cart.maxStockReached')}</Text>
            ) : null}
            {onRemove ? (
              <Pressable style={styles.removeBtn} onPress={onRemove} hitSlop={8}>
                <Text style={styles.removeBtnText}>{t('cart.remove')}</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}
