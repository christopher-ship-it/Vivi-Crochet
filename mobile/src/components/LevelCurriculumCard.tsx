import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../i18n';
import { uiFonts, type UiFonts } from '../i18n/uiFonts';
import { colors, radii, spacing } from '../theme';
interface Props {
  name: string;
  /** Shown as the "LEVEL n" badge. Omit to hide the badge. */
  level?: number;
  tagline?: string | null;
  /** "What you learn" points, set by admin. */
  items: string[];
  /** Controlled mode (lets a parent keep one card open at a time). Omit for self-managed. */
  expanded?: boolean;
  onToggle?: () => void;
}

/** Course name header + tagline + "what you learn" checklist, all from the admin course. */
export function LevelCurriculumCard({ name, level, tagline, items, expanded, onToggle }: Props) {
  const { language } = useI18n();
  const styles = useMemo(() => createStyles(uiFonts(language)), [language]);

  const [innerOpen, setInnerOpen] = useState(false);
  const open = expanded ?? innerOpen;
  const toggle = onToggle ?? (() => setInnerOpen((v) => !v));

  return (
    <View style={styles.card}>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${name}, what you learn`}
      >
        <LinearGradient
          colors={[colors.pink, colors.pinkDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.head}
        >
          <View style={styles.headText}>
            <Text style={styles.label} numberOfLines={1}>
              {name}
            </Text>
            {level != null ? (
              <View style={styles.levelBadge}>
                <Text style={styles.levelBadgeText}>LEVEL {level}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.pill}>
            <Text style={styles.pillText}>What you learn</Text>
            <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={13} color={colors.pinkDark} />
          </View>
        </LinearGradient>
      </Pressable>

      {open ? (
      <View style={styles.body}>
        {tagline ? <Text style={styles.tagline}>{tagline}</Text> : null}
        {items.map((item) => (
          <View key={item} style={styles.row}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text style={styles.itemText}>{item}</Text>
          </View>
        ))}
      </View>
      ) : null}
    </View>
  );
}

function createStyles(fonts: UiFonts) {
  return StyleSheet.create({
    card: {
      borderRadius: radii.xl,
      backgroundColor: colors.white,
      overflow: 'hidden',
      marginBottom: 8,
      shadowColor: colors.pinkDark,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
      elevation: 3,
    },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
    },
    headText: {
      flex: 1,
      alignItems: 'flex-start',
      gap: 4,
    },
    levelBadge: {
      backgroundColor: colors.yellow,
      borderRadius: radii.pill,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    levelBadgeText: {
      fontFamily: fonts.extraBold,
      fontSize: 10,
      letterSpacing: 0.6,
      color: colors.ink,
    },
    label: {
      fontFamily: fonts.extraBold,
      fontSize: 15,
      color: colors.white,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: colors.white,
      borderRadius: radii.pill,
      paddingHorizontal: 9,
      paddingVertical: 5,
    },
    pillText: {
      fontFamily: fonts.extraBold,
      fontSize: 11,
      color: colors.pinkDark,
    },
    tagline: {
      fontFamily: fonts.semiBold,
      fontSize: 13,
      color: colors.pinkDark,
    },
    body: {
      padding: spacing.md,
      gap: 9,
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
