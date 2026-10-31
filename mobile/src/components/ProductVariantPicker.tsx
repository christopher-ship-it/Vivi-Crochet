import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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

/** Shades shown before "Show all": about two rows of small swatches. */
const COLLAPSED_COUNT = 12;

/** Compact colour/option grid for parent products with variant SKUs. */
export function ProductVariantPicker({ product, selectedId, onSelect }: ProductVariantPickerProps) {
  const { t, language } = useI18n();
  const fonts = uiFonts(language);
  const styles = useMemo(() => createStyles(fonts), [language]);
  const [expanded, setExpanded] = useState(false);

  const variants = product.variants ?? [];
  if (variants.length === 0) return null;

  const selectedIndex = Math.max(0, variants.findIndex((v) => v.id === selectedId));
  const selected = variants[selectedIndex];
  const optionLabel = product.variantOptionName?.trim() || t('product.colourLabel').replace(/:$/, '') || 'Colour';
  // A selected shade further down keeps the whole list open, so it is never hidden.
  const collapsible = variants.length > COLLAPSED_COUNT;
  const open = !collapsible || expanded || selectedIndex >= COLLAPSED_COUNT;
  const shown = open ? variants : variants.slice(0, COLLAPSED_COUNT);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        {optionLabel}: <Text style={styles.labelValue}>
          {selected?.colourName ?? '—'}
          {selected?.productCode ? ` (${selected.productCode})` : ''}
        </Text>
      </Text>
      <View style={styles.grid}>
        {shown.map((variant) => (
          <VariantCard
            key={variant.id}
            variant={variant}
            selected={variant.id === selectedId}
            showPrice={variant.price !== selected.price}
            onPress={() => onSelect(variant.id)}
            styles={styles}
          />
        ))}
      </View>
      {collapsible && selectedIndex < COLLAPSED_COUNT ? (
        <Pressable
          onPress={() => setExpanded((v) => !v)}
          style={styles.toggle}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
        >
          <Text style={styles.toggleText}>
            {expanded
              ? t('product.showFewerColours')
              : t('product.showAllColours', { count: variants.length })}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function VariantCard({
  variant,
  selected,
  showPrice,
  onPress,
  styles,
}: {
  variant: ProductVariantSummary;
  selected: boolean;
  /** Only when this shade costs something other than the selected one. */
  showPrice: boolean;
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
      {variant.productCode ? (
        // Fixed-width swatch: shrink the code to fit instead of ending in "…" on small phones / large system fonts.
        <Text style={styles.code} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} allowFontScaling={false}>
          {variant.productCode}
        </Text>
      ) : null}
      {showPrice ? <Text style={styles.price}>{formatInr(variant.price)}</Text> : null}
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
      fontFamily: fonts.regular,
      fontSize: 15,
      color: colors.ink,
      marginBottom: spacing.sm,
    },
    labelValue: {
      fontFamily: fonts.heading,
      fontWeight: '700',
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    card: {
      width: 46,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: radii.sm,
      padding: 3,
      backgroundColor: colors.white,
    },
    cardSelected: {
      borderColor: colors.pink,
      borderWidth: 2.5,
      padding: 2,
    },
    toggle: {
      alignSelf: 'flex-start',
      marginTop: spacing.sm,
      paddingVertical: 6,
    },
    toggleText: {
      fontFamily: fonts.extraBold,
      fontSize: 13,
      color: colors.pinkDark,
    },
    cardOut: {
      opacity: 0.55,
    },
    thumb: {
      width: '100%',
      aspectRatio: 1,
      borderRadius: 6,
      marginBottom: 4,
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
    code: {
      fontFamily: fonts.extraBold,
      fontSize: 9,
      color: colors.ink,
      textAlign: 'center',
    },
    price: {
      fontFamily: fonts.extraBold,
      fontSize: 9,
      color: colors.ink,
      textAlign: 'center',
    },
    outLabel: {
      fontFamily: fonts.regular,
      fontSize: 9,
      color: colors.pink,
      marginTop: 2,
    },
  });
}
