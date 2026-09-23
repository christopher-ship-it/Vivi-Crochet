import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CartItemRecommendation } from '../cart/recommendations';
import { canIncreaseQuantity, isOutOfStock } from '../cart/stock';
import { useI18n } from '../i18n';
import { uiFonts, type UiFonts } from '../i18n/uiFonts';
import { colors, radii } from '../theme';
import type { Product, RecommendedEssentialSummary } from '../types';
import { formatInr } from '../utils/format';
import { AppImage } from './AppImage';

function createStyles(fonts: UiFonts) {
  return StyleSheet.create({
    wrap: {
      marginTop: -2,
      marginBottom: 10,
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: 8,
      backgroundColor: colors.white,
      borderWidth: 1,
      borderColor: colors.softBorder,
      borderTopWidth: 0,
      borderBottomLeftRadius: radii.md,
      borderBottomRightRadius: radii.md,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.softBorder,
      marginBottom: 8,
    },
    sectionLabel: {
      fontFamily: fonts.extraBold,
      fontSize: 10,
      letterSpacing: 1,
      color: colors.pink,
      marginBottom: 2,
    },
    sectionHint: {
      fontFamily: fonts.regular,
      fontSize: 11,
      lineHeight: 15,
      color: colors.muted,
      marginBottom: 6,
    },
    courseRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 2,
    },
    courseBody: {
      flex: 1,
      gap: 2,
    },
    courseName: {
      fontFamily: fonts.semiBold,
      fontSize: 13,
      color: colors.ink,
    },
    courseMeta: {
      fontFamily: fonts.regular,
      fontSize: 11,
      color: colors.muted,
    },
    courseCta: {
      marginTop: 6,
      alignSelf: 'flex-start',
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: colors.pink,
      borderRadius: radii.sm,
    },
    courseCtaText: {
      fontFamily: fonts.extraBold,
      fontSize: 10,
      letterSpacing: 0.6,
      color: colors.pink,
    },
    essentialRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 5,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.softBorder,
    },
    essentialRowFirst: {
      borderTopWidth: 0,
      paddingTop: 0,
    },
    thumb: {
      width: 32,
      height: 32,
      borderRadius: 6,
      backgroundColor: colors.mediaWash,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    thumbImage: {
      width: '100%',
      height: '100%',
    },
    thumbInitial: {
      fontFamily: fonts.extraBold,
      fontSize: 12,
      color: colors.ink,
      opacity: 0.25,
    },
    essentialBody: {
      flex: 1,
      gap: 1,
      minWidth: 0,
    },
    essentialName: {
      fontFamily: fonts.semiBold,
      fontSize: 12,
      color: colors.ink,
    },
    essentialPrice: {
      fontFamily: fonts.semiBold,
      fontSize: 11,
      color: colors.pink,
    },
    stockHint: {
      fontFamily: fonts.regular,
      fontSize: 10,
      color: colors.muted,
    },
    addBtn: {
      minWidth: 56,
      paddingVertical: 5,
      paddingHorizontal: 8,
      borderRadius: 6,
      backgroundColor: colors.pink,
      alignItems: 'center',
    },
    addBtnAdded: {
      backgroundColor: colors.pinkSoft,
      borderWidth: 1,
      borderColor: colors.softBorder,
    },
    addBtnDisabled: {
      opacity: 0.45,
    },
    addBtnText: {
      fontFamily: fonts.extraBold,
      fontSize: 11,
      color: colors.white,
    },
    addBtnTextAdded: {
      color: colors.pink,
    },
    essentialsAfterCourse: {
      marginTop: 8,
    },
  });
}

interface CartRecommendBlockProps {
  recommendation: CartItemRecommendation;
  onAddEssential: (essential: RecommendedEssentialSummary) => Promise<void>;
  onRemoveEssential: (productId: string) => Promise<void>;
  onOpenCourse: (courseId: string) => void;
  isInCart: (productId: string) => boolean;
  cartQuantity: (productId: string) => number;
}

export function CartRecommendBlock({
  recommendation,
  onAddEssential,
  onRemoveEssential,
  onOpenCourse,
  isInCart,
  cartQuantity,
}: CartRecommendBlockProps) {
  const { t, language } = useI18n();
  const fonts = uiFonts(language);
  const styles = useMemo(() => createStyles(fonts), [language]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { course, essentials, priority } = recommendation;
  if (!course && essentials.length === 0) return null;

  async function handleAdd(essential: RecommendedEssentialSummary) {
    if (busyId || isInCart(essential.id) || isOutOfStock(essential.availableStock)) return;
    setBusyId(essential.id);
    try {
      await onAddEssential(essential);
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(productId: string) {
    if (busyId) return;
    setBusyId(productId);
    try {
      await onRemoveEssential(productId);
    } catch {
      // ignore
    } finally {
      setBusyId(null);
    }
  }

  const courseId =
    course?.kind === 'foundation' ? course.courseId : course?.course.id;
  const courseName = course?.course.name;
  const coursePrice =
    course && 'price' in course.course && course.course.price > 0
      ? course.course.price
      : null;

  const courseBlock =
    course && courseId ? (
      <View>
        <Text style={styles.sectionLabel}>
          {course.eyebrow === 'learnThis'
            ? t('cart.learnThisCreation')
            : t('cart.learnAndCreate')}
        </Text>
        <Text style={styles.sectionHint}>
          {course.eyebrow === 'learnThis'
            ? t('cart.learnHowToMake')
            : t('cart.foundationHint')}
        </Text>
        <View style={styles.courseRow}>
          <View style={styles.courseBody}>
            <Text style={styles.courseName} numberOfLines={2}>
              {courseName}
            </Text>
            {coursePrice != null ? (
              <Text style={styles.courseMeta}>{formatInr(coursePrice)}</Text>
            ) : null}
          </View>
        </View>
        <Pressable
          style={styles.courseCta}
          onPress={() => onOpenCourse(courseId)}
          accessibilityRole="button"
        >
          <Text style={styles.courseCtaText}>
            {course.eyebrow === 'learnThis'
              ? t('cart.viewCourse')
              : t('cart.exploreFoundation')}
          </Text>
        </Pressable>
      </View>
    ) : null;

  const essentialsBlock =
    essentials.length > 0 ? (
      <View>
        <Text style={styles.sectionLabel}>{t('cart.youMayNeed')}</Text>
        <Text style={styles.sectionHint}>{t('cart.youMayNeedHint')}</Text>
        {essentials.map((essential, index) => {
          const inCart = isInCart(essential.id);
          const qty = cartQuantity(essential.id);
          const busy = busyId === essential.id;
          const out = isOutOfStock(essential.availableStock);
          const atMax = inCart && !canIncreaseQuantity(qty, essential.availableStock);
          return (
            <View
              key={essential.id}
              style={[styles.essentialRow, index === 0 && styles.essentialRowFirst]}
            >
              <View style={styles.thumb}>
                {essential.imageUrl ? (
                  <AppImage
                    uri={essential.imageUrl}
                    style={styles.thumbImage}
                    contentFit="contain"
                  />
                ) : (
                  <Text style={styles.thumbInitial}>{essential.name.charAt(0)}</Text>
                )}
              </View>
              <View style={styles.essentialBody}>
                <Text style={styles.essentialName} numberOfLines={2}>
                  {essential.name}
                </Text>
                <Text style={styles.essentialPrice}>{formatInr(essential.price)}</Text>
                {out ? (
                  <Text style={styles.stockHint}>{t('product.outOfStockBadge')}</Text>
                ) : atMax ? (
                  <Text style={styles.stockHint}>{t('cart.maxStockReached')}</Text>
                ) : null}
              </View>
              {inCart ? (
                <Pressable
                  style={[styles.addBtn, styles.addBtnAdded, busy && styles.addBtnDisabled]}
                  disabled={busy}
                  onPress={() => void handleRemove(essential.id)}
                  accessibilityRole="button"
                  accessibilityLabel={t('cart.remove')}
                >
                  <Text style={[styles.addBtnText, styles.addBtnTextAdded]}>
                    {busy ? '…' : t('cart.remove')}
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  style={[styles.addBtn, (busy || out) && styles.addBtnDisabled]}
                  disabled={busy || out}
                  onPress={() => void handleAdd(essential)}
                  accessibilityRole="button"
                  accessibilityLabel={t('cart.addPlus')}
                >
                  <Text style={styles.addBtnText}>
                    {busy ? '…' : t('cart.addPlus')}
                  </Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </View>
    ) : null;

  const first = priority === 'essentials' ? essentialsBlock : courseBlock;
  const second = priority === 'essentials' ? courseBlock : essentialsBlock;

  return (
    <View style={styles.wrap}>
      <View style={styles.divider} />
      {first}
      {first && second ? <View style={styles.essentialsAfterCourse} /> : null}
      {second}
    </View>
  );
}

/** Map essential summary into a Product shape for existing cart.addProduct. */
export function essentialToProduct(essential: RecommendedEssentialSummary): Product {
  return {
    id: essential.id,
    name: essential.name,
    category: essential.category,
    price: essential.price,
    imageUrl: essential.imageUrl,
    sortOrder: 0,
    productType: 'Resell',
    availableStock: essential.availableStock,
    status: 'Published',
    createdAt: '',
    updatedAt: '',
  };
}
