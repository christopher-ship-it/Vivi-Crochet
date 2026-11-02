import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '../i18n';
import { uiFonts, type UiFonts } from '../i18n/uiFonts';
import type { Product, ProductVariantSummary } from '../types';
import { colors, radii, spacing } from '../theme';
import { formatInr } from '../utils/format';
import { AppDialog, type AppDialogContent } from './AppDialog';
import { AppImage } from './AppImage';
import { isOutOfStock } from '../cart/stock';

interface ProductVariantPickerProps {
  product: Product;
  selectedId: string;
  onSelect: (variantId: string) => void;
  /** The full colour list is controlled by the page, so other buttons can open it too. */
  sheetOpen: boolean;
  onSheetOpenChange: (open: boolean) => void;
  /** Pieces of each shade already in the cart, by shade id. */
  quantityInCart: Record<string, number>;
  /** Adds one piece of a shade without leaving the colour list. */
  onQuickAdd: (variantId: string) => void;
  /** Takes one piece of a shade back out of the cart. */
  onQuickRemove: (variantId: string) => void;
  onViewCart: () => void;
  /** Cart message popup, shown inside the list because the list is a separate window above the page. */
  dialog: AppDialogContent | null;
  onDialogClose: () => void;
}

/** Shades in the swipe row; the rest are behind the "Show all" tile. */
const ROW_COUNT = 16;
const GRID_COLUMNS = 4;
const GRID_GAP = 8;

/** Swipe row of shades for parent products with variant SKUs; "Show all" opens the full searchable grid. */
export function ProductVariantPicker({
  product,
  selectedId,
  onSelect,
  sheetOpen,
  onSheetOpenChange,
  quantityInCart,
  onQuickAdd,
  onQuickRemove,
  onViewCart,
  dialog,
  onDialogClose,
}: ProductVariantPickerProps) {
  const { t, language } = useI18n();
  const insets = useSafeAreaInsets();
  const fonts = uiFonts(language);
  const styles = useMemo(() => createStyles(fonts), [language]);
  const [filter, setFilter] = useState('');
  // Four shades fill the row: each cell is a quarter of the measured width, less the gaps between them.
  const [gridWidth, setGridWidth] = useState(0);
  const cellWidth = gridWidth > 0 ? (gridWidth - 3 * GRID_GAP) / 4 : undefined;

  const variants = product.variants ?? [];
  if (variants.length === 0) return null;

  const selected = variants.find((v) => v.id === selectedId) ?? variants[0];
  const optionLabel = product.variantOptionName?.trim() || t('product.colourLabel').replace(/:$/, '') || 'Colour';
  const rowVariants = variants.slice(0, ROW_COUNT);
  const totalInCart = variants.reduce((sum, v) => sum + (quantityInCart[v.id] ?? 0), 0);
  const needle = filter.trim().toLowerCase();
  const filtered = needle
    ? variants.filter(
        (v) =>
          v.colourName?.toLowerCase().includes(needle) ||
          v.productCode?.toLowerCase().includes(needle),
      )
    : variants;

  function closeSheet() {
    onSheetOpenChange(false);
    setFilter('');
  }

  /** In the colour list a tap marks the shade on the page and adds one piece; tapping again adds another. */
  function tapShade(variant: ProductVariantSummary) {
    onSelect(variant.id);
    if (!isOutOfStock(variant.availableStock)) onQuickAdd(variant.id);
  }

  return (
    <View style={styles.wrap}>
      {/* The main photo is far above the swatches, so the chosen shade is previewed right here. */}
      <View style={styles.selectedRow}>
        <ShadeThumb variant={selected} style={styles.selectedThumb} styles={styles} />
        <Text style={[styles.label, styles.selectedLabel]}>
          {optionLabel}: <Text style={styles.labelValue}>
            {selected.colourName ?? '—'}
            {selected.productCode ? ` (${selected.productCode})` : ''}
          </Text>
        </Text>
      </View>
      <View style={styles.grid4} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
        {rowVariants.map((variant) => (
          <VariantCard
            key={variant.id}
            variant={variant}
            selected={variant.id === selected.id}
            showPrice={variant.price !== selected.price}
            onPress={() => onSelect(variant.id)}
            cardStyle={{ width: cellWidth }}
            styles={styles}
          />
        ))}
      </View>
      {variants.length > ROW_COUNT ? (
        <Pressable
          onPress={() => onSheetOpenChange(true)}
          style={styles.showAllButton}
          accessibilityRole="button"
        >
          <Text style={styles.showAllText}>
            {t('product.showAllColours', { count: variants.length })}
          </Text>
        </Pressable>
      ) : null}

      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={closeSheet}>
        <View style={styles.sheetRoot}>
          <Pressable style={styles.backdrop} onPress={closeSheet} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle} numberOfLines={2}>
                {t('product.showAllColours', { count: variants.length })}
              </Text>
              <Pressable
                onPress={closeSheet}
                hitSlop={10}
                style={styles.sheetCloseIcon}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                <Ionicons name="close" size={22} color={colors.ink} />
              </Pressable>
            </View>
            <TextInput
              style={styles.filter}
              value={filter}
              onChangeText={setFilter}
              placeholder="Search colour name or code"
              placeholderTextColor={colors.muted}
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            <Text style={styles.sheetHint}>Tap a colour to add 1 · tap × to remove it</Text>
            <FlatList
              data={filtered}
              style={styles.gridList}
              keyExtractor={(v) => v.id}
              numColumns={GRID_COLUMNS}
              columnWrapperStyle={styles.gridRow}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={<Text style={styles.noMatch}>No matching colour</Text>}
              renderItem={({ item }) => (
                <VariantCard
                  variant={item}
                  selected={item.id === selected.id}
                  showPrice={item.price !== selected.price}
                  onPress={() => tapShade(item)}
                  cardStyle={styles.gridCard}
                  cartQty={quantityInCart[item.id]}
                  onQuickRemove={() => onQuickRemove(item.id)}
                  styles={styles}
                />
              )}
            />
            {totalInCart > 0 ? (
              <View style={styles.sheetCartBar}>
                <Text style={styles.sheetCartText}>{totalInCart} in cart</Text>
                <Pressable
                  style={styles.sheetCartBtn}
                  onPress={() => {
                    closeSheet();
                    onViewCart();
                  }}
                  accessibilityRole="button"
                >
                  <Text style={styles.sheetCartBtnText}>View cart</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
          {dialog ? (
            <AppDialog title={dialog.title} message={dialog.message} onClose={onDialogClose} />
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

function ShadeThumb({
  variant,
  style,
  styles,
}: {
  variant: ProductVariantSummary;
  style: object;
  styles: ReturnType<typeof createStyles>;
}) {
  if (variant.imageUrl) return <AppImage uri={variant.imageUrl} style={style} contentFit="cover" />;
  return (
    <View style={[style, styles.thumbFallback, variant.colourHex ? { backgroundColor: variant.colourHex } : null]}>
      {!variant.colourHex ? (
        <Text style={styles.thumbLetter}>{(variant.colourName ?? '?').charAt(0)}</Text>
      ) : null}
    </View>
  );
}

function VariantCard({
  variant,
  selected,
  showPrice,
  onPress,
  cardStyle,
  cartQty,
  onQuickRemove,
  styles,
}: {
  variant: ProductVariantSummary;
  selected: boolean;
  /** Only when this shade costs something other than the selected one. */
  showPrice: boolean;
  onPress: () => void;
  cardStyle: object;
  /** Set only in the colour list: pieces of this shade in the cart, and the "×" that removes them all. */
  cartQty?: number;
  onQuickRemove?: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const out = isOutOfStock(variant.availableStock);
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.card,
        cardStyle,
        selected && styles.cardSelected,
        !!cartQty && styles.cardInCart,
        out && styles.cardOut,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={variant.colourName ?? variant.productCode ?? 'Variant'}
    >
      <ShadeThumb variant={variant} style={styles.thumb} styles={styles} />
      {variant.colourName ? (
        <Text style={styles.name} numberOfLines={3}>
          {variant.colourName}
        </Text>
      ) : null}
      {variant.productCode ? (
        // Fixed-width swatch: shrink the code to fit instead of ending in "…" on small phones / large system fonts.
        <Text style={styles.code} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} allowFontScaling={false}>
          {variant.productCode}
        </Text>
      ) : null}
      {showPrice ? <Text style={styles.price}>{formatInr(variant.price)}</Text> : null}
      {out ? <Text style={styles.outLabel}>Out of stock</Text> : null}
      {/* In the cart: a count at the top left and a "×" at the top right that takes the shade out. */}
      {cartQty && onQuickRemove ? (
        <>
          <View style={styles.qtyBadge} pointerEvents="none">
            <Text style={styles.qtyBadgeText}>{cartQty}</Text>
          </View>
          <Pressable
            style={styles.removeBtn}
            onPress={onQuickRemove}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${variant.colourName ?? variant.productCode ?? 'shade'} from cart`}
          >
            <Text style={styles.removeBtnText}>×</Text>
          </Pressable>
        </>
      ) : null}
    </Pressable>
  );
}

function createStyles(fonts: UiFonts) {
  return StyleSheet.create({
    wrap: {
      marginTop: spacing.sm,
      marginBottom: spacing.xs,
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
    filter: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.sm,
      paddingHorizontal: 10,
      paddingVertical: 8,
      marginBottom: spacing.sm,
      fontFamily: fonts.regular,
      fontSize: 14,
      color: colors.ink,
      backgroundColor: colors.white,
    },
    noMatch: {
      fontFamily: fonts.regular,
      fontSize: 13,
      color: colors.muted,
      marginTop: spacing.xs,
    },
    selectedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    selectedThumb: {
      width: 56,
      height: 56,
      borderRadius: radii.sm,
      backgroundColor: 'rgba(0,0,0,0.04)',
    },
    selectedLabel: {
      flex: 1,
      marginBottom: 0,
    },
    /* Four shades per row; tapping one shows its name and code in the label above. */
    showAllButton: {
      marginTop: 10,
      alignItems: 'center',
      paddingVertical: 12,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: colors.pink,
      backgroundColor: colors.white,
    },
    showAllText: {
      fontFamily: fonts.extraBold,
      fontSize: 14,
      color: colors.pinkDark,
    },
    grid4: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: GRID_GAP,
    },
    row: {
      gap: 6,
      paddingRight: spacing.md,
    },
    rowCard: {
      width: '23.5%',
    },
    moreTile: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: colors.pink,
      borderRadius: radii.sm,
      backgroundColor: colors.white,
      paddingHorizontal: 4,
    },
    moreText: {
      fontFamily: fonts.extraBold,
      fontSize: 12,
      lineHeight: 17,
      color: colors.pinkDark,
      textAlign: 'center',
    },
    gridRow: {
      gap: 6,
      marginBottom: 6,
    },
    gridCard: {
      // Four per row, wide enough to read the shade name under the photo.
      width: '23%',
    },
    name: {
      fontFamily: fonts.semiBold,
      fontSize: 11,
      lineHeight: 15,
      color: colors.ink,
      textAlign: 'center',
      marginBottom: 2,
    },
    card: {
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
    gridList: {
      flex: 1,
    },
    cardInCart: {
      borderColor: colors.success,
      borderWidth: 2.5,
      padding: 2,
    },
    qtyBadge: {
      position: 'absolute',
      top: 6,
      left: 6,
      minWidth: 24,
      height: 24,
      borderRadius: 12,
      paddingHorizontal: 5,
      backgroundColor: colors.success,
      alignItems: 'center',
      justifyContent: 'center',
    },
    qtyBadgeText: {
      fontFamily: fonts.extraBold,
      fontSize: 13,
      lineHeight: 17,
      color: colors.white,
    },
    removeBtn: {
      position: 'absolute',
      top: 6,
      right: 6,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.white,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    removeBtnText: {
      fontFamily: fonts.extraBold,
      fontSize: 17,
      lineHeight: 20,
      color: colors.ink,
    },
    sheetHint: {
      fontFamily: fonts.regular,
      fontSize: 12,
      color: colors.muted,
      marginBottom: spacing.sm,
    },
    sheetCartBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.softBorder,
    },
    sheetCartText: {
      fontFamily: fonts.extraBold,
      fontSize: 15,
      color: colors.ink,
    },
    sheetCartBtn: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: radii.pill,
      backgroundColor: colors.pink,
    },
    sheetCartBtnText: {
      fontFamily: fonts.extraBold,
      fontSize: 14,
      color: colors.white,
    },
    sheetRoot: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(34, 26, 30, 0.4)',
    },
    sheet: {
      height: '88%',
      backgroundColor: colors.white,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingHorizontal: spacing.md,
      paddingTop: 14,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
    },
    sheetCloseIcon: {
      flexShrink: 0,
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sheetTitle: {
      flex: 1,
      marginRight: spacing.sm,
      fontFamily: fonts.extraBold,
      fontSize: 17,
      lineHeight: 22,
      color: colors.ink,
    },
    sheetClose: {
      fontFamily: fonts.semiBold,
      fontSize: 14,
      color: colors.muted,
    },
  });
}
