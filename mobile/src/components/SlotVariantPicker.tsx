import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { listShopSlots } from '../api/shopSlots';
import { isOutOfStock } from '../cart/stock';
import { useI18n } from '../i18n';
import { uiFonts, type UiFonts } from '../i18n/uiFonts';
import type { Product, ShopSlot } from '../types';
import { colors, radii, spacing } from '../theme';
import { formatInr } from '../utils/format';
import { AppImage } from './AppImage';

interface SlotVariantPickerProps {
  product: Product;
  onSelect: (productId: string) => void;
}

/**
 * Amazon-style option row shown on a product page when the product belongs to a shop slot with
 * other products (e.g. the Yarn slot: one card per colour). Each card is a real catalog product, so
 * selecting one simply opens that product; price, stock and cart behaviour stay per product.
 */
export function SlotVariantPicker({ product, onSelect }: SlotVariantPickerProps) {
  const { t, language } = useI18n();
  const fonts = uiFonts(language);
  const styles = useMemo(() => createStyles(fonts), [language]);
  const [slot, setSlot] = useState<ShopSlot | null>(null);

  const productType = product.productType ?? 'Handmade';

  useEffect(() => {
    let cancelled = false;
    void listShopSlots(productType).then((slots) => {
      if (cancelled) return;
      // First slot (admin display order) that holds this product together with others.
      setSlot(slots.find((s) => s.products.length > 1 && s.products.some((p) => p.id === product.id)) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [product.id, productType]);

  if (!slot) return null;

  const optionName = (p: Product) =>
    [p.colourName?.trim(), p.productCode?.trim()].filter(Boolean).join(' · ') || p.name;
  const useSwatches = slot.products.every((p) => /^#[0-9a-f]{6}$/i.test(p.colourHex ?? ''));

  return (
    <View style={styles.wrap}>
      <Text style={styles.label} numberOfLines={1}>
        {t('product.colourLabel')}{' '}
        <Text style={styles.labelValue}>{optionName(product)}</Text>
      </Text>
      {useSwatches ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
          {slot.products.map((option) => {
            const selected = option.id === product.id;
            const out = isOutOfStock(option.availableStock ?? 0);
            return (
              <Pressable
                key={option.id}
                style={[styles.swatchRing, selected && styles.swatchRingSelected]}
                onPress={() => (selected ? undefined : onSelect(option.id))}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${optionName(option)}${out ? `, ${t('product.outOfStock')}` : ''}`}
              >
                <View style={[styles.swatch, { backgroundColor: option.colourHex! }, out && styles.swatchOut]} />
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {slot.products.map((option) => {
          const selected = option.id === product.id;
          const out = isOutOfStock(option.availableStock ?? 0);
          return (
            <Pressable
              key={option.id}
              style={[styles.card, selected && styles.cardSelected]}
              onPress={() => (selected ? undefined : onSelect(option.id))}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${option.productCode ?? option.name}, ${formatInr(option.price)}`}
            >
              <AppImage uri={option.imageUrl} style={styles.image} contentFit="contain" />
              <Text style={styles.code} numberOfLines={1}>{option.productCode?.trim() || option.name}</Text>
              <Text style={styles.price}>{formatInr(option.price)}</Text>
              {option.mrp && option.mrp > option.price ? (
                <Text style={styles.mrp}>{formatInr(option.mrp)}</Text>
              ) : null}
              <Text style={[styles.stock, out && styles.stockOut]}>
                {out ? t('product.outOfStock') : t('product.inStockLabel')}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      )}
    </View>
  );
}

function createStyles(fonts: UiFonts) {
  return StyleSheet.create({
    wrap: {
      marginTop: spacing.md,
    },
    label: {
      fontFamily: fonts.regular,
      fontSize: 14,
      color: colors.muted,
    },
    labelValue: {
      fontFamily: fonts.extraBold,
      color: colors.ink,
    },
    strip: {
      gap: spacing.sm,
      paddingVertical: spacing.sm,
    },
    swatchRing: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 2,
      borderColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    },
    swatchRingSelected: {
      borderColor: colors.pink,
    },
    swatch: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: colors.border,
    },
    swatchOut: {
      opacity: 0.35,
    },
    card: {
      width: 104,
      padding: spacing.sm,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.white,
    },
    cardSelected: {
      borderWidth: 2,
      borderColor: colors.pink,
    },
    image: {
      width: '100%',
      height: 64,
      borderRadius: radii.sm,
      marginBottom: 6,
    },
    code: {
      fontFamily: fonts.extraBold,
      fontSize: 13,
      color: colors.ink,
    },
    price: {
      fontFamily: fonts.semiBold,
      fontSize: 13,
      color: colors.ink,
      marginTop: 2,
    },
    mrp: {
      fontFamily: fonts.regular,
      fontSize: 11,
      color: colors.muted,
      textDecorationLine: 'line-through',
    },
    stock: {
      fontFamily: fonts.semiBold,
      fontSize: 11,
      color: colors.success,
      marginTop: 4,
    },
    stockOut: {
      color: colors.danger ?? colors.pink,
    },
  });
}
