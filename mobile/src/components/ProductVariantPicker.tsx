import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../i18n';
import { uiFonts, type UiFonts } from '../i18n/uiFonts';
import type { Product, ProductVariantSummary } from '../types';
import { colors, radii, spacing } from '../theme';
import { formatInr } from '../utils/format';
import { AppImage } from './AppImage';
import { isOutOfStock } from '../cart/stock';

interface ProductVariantPickerProps {
  product: Product;
  selectedId: string;
  onSelect: (variantId: string) => void;
}

/** Amazon-style colour/option grid for parent products with variant SKUs. */
export function ProductVariantPicker({ product, selectedId, onSelect }: ProductVariantPickerProps) {
  const { t, language } = useI18n();
  const fonts = uiFonts(language);
  const styles = useMemo(() => createStyles(fonts), [language]);

  const variants = product.variants ?? [];
  if (variants.length === 0) return null;

  const selected = variants.find((v) => v.id === selectedId) ?? variants[0];
  const optionLabel = product.variantOptionName?.trim() || t('product.colourLabel').replace(/:$/, '') || 'Colour';

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        {optionLabel}: <Text style={styles.labelValue}>{selected?.colourName ?? '—'}</Text>
      </Text>
      <ScrollView
        horizontal={false}
        nestedScrollEnabled
        style={styles.scroll}
        contentContainerStyle={styles.grid}
      >
        {variants.map((variant) => (
          <VariantCard
            key={variant.id}
            variant={variant}
            selected={variant.id === selectedId}
            onPress={() => onSelect(variant.id)}
            styles={styles}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function VariantCard({
  variant,
  selected,
  onPress,
  styles,
}: {
  variant: ProductVariantSummary;
  selected: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const out = isOutOfStock(variant.availableStock);
  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, selected && styles.cardSelected, out && styles.cardOut]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={variant.colourName ?? variant.productCode ?? 'Variant'}
    >
      {variant.imageUrl ? (
        <AppImage uri={variant.imageUrl} style={styles.thumb} contentFit="cover" />
      ) : (
        <View style={[styles.thumb, styles.thumbFallback, variant.colourHex ? { backgroundColor: variant.colourHex } : null]}>
          {!variant.colourHex ? (
            <Text style={styles.thumbLetter}>{(variant.colourName ?? '?').charAt(0)}</Text>
          ) : null}
        </View>
      )}
      <Text style={styles.price}>{formatInr(variant.price)}</Text>
      {variant.mrp && variant.mrp > variant.price ? (
        <Text style={styles.mrp}>{formatInr(variant.mrp)}</Text>
      ) : null}
      {out ? <Text style={styles.outLabel}>Out of stock</Text> : null}
    </Pressable>
  );
}

function createStyles(fonts: UiFonts) {
  return StyleSheet.create({
    wrap: {
      marginTop: spacing.sm,
      marginBottom: spacing.md,
    },
    label: {
      fontFamily: fonts.body,
      fontSize: 15,
      color: colors.ink,
      marginBottom: spacing.sm,
    },
    labelValue: {
      fontFamily: fonts.heading,
      fontWeight: '700',
    },
    scroll: {
      maxHeight: 280,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    card: {
      width: '30%',
      minWidth: 96,
      flexGrow: 1,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: radii.md,
      padding: 6,
      backgroundColor: colors.white,
    },
    cardSelected: {
      borderColor: colors.pink,
      borderWidth: 2.5,
    },
    cardOut: {
      opacity: 0.55,
    },
    thumb: {
      width: '100%',
      aspectRatio: 1,
      borderRadius: 8,
      marginBottom: 6,
      backgroundColor: 'rgba(0,0,0,0.04)',
    },
    thumbFallback: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    thumbLetter: {
      fontFamily: fonts.heading,
      fontSize: 18,
      color: colors.muted,
    },
    price: {
      fontFamily: fonts.heading,
      fontSize: 13,
      color: colors.ink,
    },
    mrp: {
      fontFamily: fonts.body,
      fontSize: 11,
      color: colors.muted,
      textDecorationLine: 'line-through',
    },
    outLabel: {
      fontFamily: fonts.body,
      fontSize: 10,
      color: colors.pink,
      marginTop: 2,
    },
  });
}
