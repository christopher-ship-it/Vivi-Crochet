import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../i18n';
import { uiFonts, type UiFonts } from '../i18n/uiFonts';
import type { Product, ShopSlot } from '../types';
import { colors, spacing } from '../theme';
import { ProductCard } from './ProductCard';

interface ShopSlotSectionProps {
  slot: ShopSlot;
  showStock?: boolean;
  compact?: boolean;
  onPressProduct: (product: Product) => void;
}

/** One curated slot: its name followed by all of its products in the same 2-column grid as the shop. */
export function ShopSlotSection({ slot, showStock, compact, onPressProduct }: ShopSlotSectionProps) {
  const { language } = useI18n();
  const fonts = uiFonts(language);
  const styles = useMemo(() => createStyles(fonts), [language]);

  const rows: Product[][] = [];
  for (let i = 0; i < slot.products.length; i += 2) rows.push(slot.products.slice(i, i + 2));

  return (
    <View style={styles.section}>
      <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
        {slot.slotName}
      </Text>
      {rows.map((row, rowIndex) => (
        <View key={row[0].id} style={styles.row}>
          {row.map((product, colIndex) => (
            <ProductCard
              key={product.id}
              product={product}
              index={rowIndex * 2 + colIndex}
              showStock={showStock}
              compact={compact}
              onPress={() => onPressProduct(product)}
            />
          ))}
          {row.length === 1 ? <View style={styles.spacer} /> : null}
        </View>
      ))}
    </View>
  );
}

function createStyles(fonts: UiFonts) {
  return StyleSheet.create({
    section: {
      marginBottom: spacing.md,
    },
    title: {
      fontFamily: fonts.heading,
      fontSize: 18,
      color: colors.ink,
      marginBottom: spacing.sm,
      paddingHorizontal: 2,
    },
    row: {
      flexDirection: 'row',
      marginBottom: spacing.sm,
      alignItems: 'stretch',
      gap: spacing.sm,
    },
    spacer: {
      flex: 1,
    },
  });
}
