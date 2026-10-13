import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../i18n';
import { uiFonts, type UiFonts } from '../i18n/uiFonts';
import { colors, radii, spacing } from '../theme';
import type { OfferCurriculum } from '../utils/offerCurriculum';

interface Props {
  curriculum: OfferCurriculum;
  /** Course name shown under the level badge (optional). */
  courseName?: string;
}

/** Level badge header + tagline + topic checklist for Foundation / Signature / Mastery. */
export function LevelCurriculumCard({ curriculum, courseName }: Props) {
  const { language } = useI18n();
  const styles = useMemo(() => createStyles(uiFonts(language)), [language]);

  return (
    <View style={styles.card}>
      <LinearGradient
        colors={[colors.pink, colors.pinkDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.head}
      >
        <View style={styles.levelBadge}>
          <Text style={styles.levelBadgeText}>LEVEL {curriculum.level}</Text>
        </View>
        <Text style={styles.label}>
          {curriculum.emoji} {curriculum.label}
        </Text>
        {courseName ? <Text style={styles.courseName}>{courseName}</Text> : null}
        <Text style={styles.tagline}>{curriculum.tagline}</Text>
      </LinearGradient>

      <View style={styles.body}>
        <Text style={styles.count}>{curriculum.items.length} projects & skills</Text>
        {curriculum.items.map((item) => (
          <View key={item} style={styles.row}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text style={styles.itemText}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function createStyles(fonts: UiFonts) {
  return StyleSheet.create({
    card: {
      borderRadius: radii.xl,
      backgroundColor: colors.white,
      overflow: 'hidden',
      marginBottom: spacing.md,
      shadowColor: colors.pinkDark,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
      elevation: 3,
    },
    head: {
      padding: spacing.md,
    },
    levelBadge: {
      alignSelf: 'flex-start',
      backgroundColor: colors.yellow,
      borderRadius: radii.pill,
      paddingHorizontal: 9,
      paddingVertical: 3,
      marginBottom: 6,
    },
    levelBadgeText: {
      fontFamily: fonts.extraBold,
      fontSize: 10,
      letterSpacing: 0.8,
      color: colors.ink,
    },
    label: {
      fontFamily: fonts.extraBold,
      fontSize: 17,
      color: colors.white,
    },
    courseName: {
      fontFamily: fonts.semiBold,
      fontSize: 12,
      color: 'rgba(255, 255, 255, 0.82)',
      marginTop: 2,
    },
    tagline: {
      fontFamily: fonts.semiBold,
      fontSize: 13,
      color: 'rgba(255, 255, 255, 0.95)',
      marginTop: 6,
    },
    body: {
      padding: spacing.md,
      gap: 9,
    },
    count: {
      fontFamily: fonts.extraBold,
      fontSize: 11,
      letterSpacing: 0.6,
      color: colors.muted,
      textTransform: 'uppercase',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    itemText: {
      flex: 1,
      fontFamily: fonts.semiBold,
      fontSize: 14,
      color: colors.ink,
    },
  });
}
