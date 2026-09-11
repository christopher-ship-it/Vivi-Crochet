import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { lineTotal } from '../cart/calculations';
import type { CartLineItem } from '../cart/types';
import { colors, fonts, radii, spacing } from '../theme';
import { formatInr } from '../utils/format';

const PLACEHOLDER_COLORS = ['#ffe3ec', '#f3e8ff', '#fff6d6', '#f7f4f5'];

interface CartLineRowProps {
  item: CartLineItem;
  index: number;
  unavailable?: boolean;
  readOnly?: boolean;
  onIncrease: () => void;
  onDecrease: () => void;
  onRemove?: () => void;
}

export function CartLineRow({
  item,
  index,
  unavailable,
  readOnly,
  onIncrease,
  onDecrease,
  onRemove,
}: CartLineRowProps) {
  const bg = PLACEHOLDER_COLORS[index % PLACEHOLDER_COLORS.length];
  const atMax =
    typeof item.availableStock === 'number' && item.availableStock > 0
      ? item.quantity >= item.availableStock
      : false;

  return (
    <View style={[styles.row, unavailable && styles.rowUnavailable]}>
      <View style={[styles.thumb, !item.imageUrl && { backgroundColor: bg }]}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.thumbImage} resizeMode="contain" />
        ) : (
          <Text style={styles.thumbInitial}>{item.name.charAt(0)}</Text>
        )}
      </View>

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
        {item.category && <Text style={styles.category}>{item.category}</Text>}
        <Text style={styles.unitPrice}>{formatInr(item.price)} each</Text>

        {unavailable ? (
          <Text style={styles.unavailable}>This product is no longer available.</Text>
        ) : readOnly ? (
          <View style={styles.qtyRow}>
            <Text style={styles.readOnlyQty}>Qty {item.quantity}</Text>
            <Text style={styles.lineTotal}>{formatInr(lineTotal(item))}</Text>
          </View>
        ) : (
          <>
            <View style={styles.qtyRow}>
              <View style={styles.qtyControl}>
                <Pressable style={styles.qtyBtn} onPress={onDecrease}>
                  <Text style={styles.qtyBtnText}>−</Text>
                </Pressable>
                <Text style={styles.qtyValue}>{item.quantity}</Text>
                <Pressable
                  style={[styles.qtyBtn, atMax && styles.qtyBtnDisabled]}
                  onPress={onIncrease}
                  disabled={atMax}
                >
                  <Text style={styles.qtyBtnText}>+</Text>
                </Pressable>
              </View>
              <Text style={styles.lineTotal}>{formatInr(lineTotal(item))}</Text>
            </View>
            {onRemove && (
              <Pressable style={styles.removeBtn} onPress={onRemove} hitSlop={8}>
                <Text style={styles.removeBtnText}>Remove</Text>
              </Pressable>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 14,
    padding: 14,
    marginBottom: 10,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.softBorder,
  },
  rowUnavailable: {
    opacity: 0.65,
  },
  thumb: {
    width: 76,
    height: 76,
    borderRadius: radii.md,
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
    fontSize: 28,
    color: colors.ink,
    opacity: 0.22,
  },
  body: {
    flex: 1,
  },
  name: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 18,
  },
  category: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  unitPrice: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.pink,
    marginTop: 4,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
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
    width: 34,
    height: 34,
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
    width: 32,
    textAlign: 'center',
    fontFamily: fonts.extraBold,
    fontSize: 13,
    color: colors.ink,
  },
  lineTotal: {
    fontFamily: fonts.extraBold,
    fontSize: 15,
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
    marginTop: 8,
    paddingVertical: 2,
  },
  removeBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.muted,
  },
});
