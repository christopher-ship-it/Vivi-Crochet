import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../i18n';
import { uiFonts, type UiFonts } from '../i18n/uiFonts';
import { colors } from '../theme';

interface Props {
  /** Admin's offer name, e.g. "VIVI Diwali Crochet Celebration". */
  title: string;
  /** Collection price, already formatted in the buyer's currency. */
  price: string;
  /** What the courses cost one by one, formatted; omit when it is not known. */
  separateTotal?: string | null;
  /** The saving, formatted; omit when there is none. */
  savings?: string | null;
  onPress: () => void;
}

/**
 * Shown on the Learn page under the single courses, so someone about to buy one course sees
 * that the whole collection costs less than buying them one by one.
 */
export function CollectionOfferBanner({ title, price, separateTotal, savings, onPress }: Props) {
  const { t, language } = useI18n();
  const styles = useMemo(() => createStyles(uiFonts(language)), [language]);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${price}. ${savings ? t('offers.youSave', { amount: savings }) : ''}`}
    >
      <LinearGradient
        colors={['#f2336f', '#c8145a', '#7d1048']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View pointerEvents="none" style={styles.glow} />
        <View style={styles.left}>
          <View style={styles.badge}>
            <Ionicons name="star" size={10} color={colors.ink} />
            <Text style={styles.badgeText}>{t('offers.bestValue')}</Text>
          </View>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.priceRow}>
            <Text style={styles.price}>{price}</Text>
            {separateTotal ? <Text style={styles.was}>{separateTotal}</Text> : null}
          </View>
          {savings ? (
            <Text style={styles.save} numberOfLines={1}>
              {t('offers.youSave', { amount: savings })}
            </Text>
          ) : null}
        </View>
        <View style={styles.arrow}>
          <Ionicons name="arrow-forward" size={18} color={colors.pink} />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function createStyles(fonts: UiFonts) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      borderRadius: 18,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(255, 214, 120, 0.5)',
    },
    glow: {
      position: 'absolute',
      width: 160,
      height: 160,
      borderRadius: 80,
      right: -40,
      top: -60,
      backgroundColor: 'rgba(255, 214, 120, 0.22)',
    },
    left: {
      flex: 1,
      gap: 2,
    },
    badge: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 1,
      borderRadius: 999,
      backgroundColor: colors.yellow,
    },
    badgeText: {
      fontFamily: fonts.extraBold,
      fontSize: 10,
      lineHeight: 16,
      letterSpacing: 0.8,
      color: colors.ink,
    },
    title: {
      marginTop: 4,
      fontFamily: fonts.extraBold,
      fontSize: 14,
      lineHeight: 20,
      color: colors.white,
    },
    priceRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 8,
    },
    price: {
      fontFamily: fonts.extraBold,
      fontSize: 24,
      lineHeight: 30,
      color: colors.white,
    },
    was: {
      fontFamily: fonts.semiBold,
      fontSize: 13,
      color: 'rgba(255, 255, 255, 0.75)',
      textDecorationLine: 'line-through',
    },
    save: {
      fontFamily: fonts.extraBold,
      fontSize: 12,
      color: '#ffe9a8',
    },
    arrow: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.white,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
