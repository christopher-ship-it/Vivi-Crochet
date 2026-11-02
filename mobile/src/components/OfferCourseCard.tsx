import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../i18n';
import { uiFonts, type UiFonts } from '../i18n/uiFonts';
import { colors, radii, spacing } from '../theme';
import { AppImage } from './AppImage';

interface Props {
  name: string;
  /** Position in the collection, shown as "LEVEL n". Comes from the order the admin set. */
  level?: number;
  tagline?: string | null;
  thumbnailUrl?: string | null;
  lessonCount?: number;
  /** Price already formatted in the buyer's currency; omit when the course is not sold separately. */
  priceLabel?: string | null;
  owned?: boolean;
  /** "What you learn" points, set by admin. */
  topics?: string[];
  expanded?: boolean;
  onToggle?: () => void;
  onOpen: () => void;
  /** Small tile for a horizontal row instead of the full card. */
  compact?: boolean;
  /** One slim line per course, for the "What's included" list. */
  slim?: boolean;
  /** A project/add-on course rather than one of the numbered levels: shows "ADD-ON COURSE" instead of "LEVEL n". */
  addOn?: boolean;
}

/**
 * One course inside the collection: photo, name, tagline, its own price and a button to open it,
 * with the admin's "what you learn" points folding out underneath.
 */
export function OfferCourseCard({
  name,
  level,
  tagline,
  thumbnailUrl,
  lessonCount,
  priceLabel,
  owned,
  topics,
  expanded,
  onToggle,
  onOpen,
  compact,
  slim,
  addOn,
}: Props) {
  const { t, language } = useI18n();
  const styles = useMemo(() => createStyles(uiFonts(language)), [language]);
  const hasTopics = Boolean(topics && topics.length > 0);
  const badgeText = t('offers.addOn');

  if (slim) {
    // One slim row per course; tapping it folds out what the course covers.
    return (
      <View style={styles.slim}>
        <Pressable
          style={styles.slimRow}
          onPress={hasTopics ? onToggle : onOpen}
          accessibilityRole="button"
          accessibilityState={hasTopics ? { expanded: Boolean(expanded) } : undefined}
          accessibilityLabel={name}
        >
          <View style={styles.slimThumb}>
            {thumbnailUrl ? (
              <AppImage uri={thumbnailUrl} style={styles.thumbImage} contentFit="cover" accessibilityLabel={name} />
            ) : (
              <Text style={styles.slimIndex}>{level ?? ''}</Text>
            )}
          </View>
          <View style={styles.slimBody}>
            <Text style={styles.slimName} numberOfLines={1}>
              {name}
            </Text>
            {tagline || (lessonCount != null && lessonCount > 0) ? (
              <Text style={styles.slimMeta} numberOfLines={1}>
                {[
                  lessonCount != null && lessonCount > 0
                    ? lessonCount === 1
                      ? t('offers.lessonOne')
                      : t('offers.lessonsShort', { count: lessonCount })
                    : null,
                  tagline,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            ) : null}
          </View>
          {hasTopics ? (
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.pinkDark} />
          ) : (
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
          )}
        </Pressable>
        {expanded && hasTopics ? (
          <View style={styles.slimTopics}>
            {topics!.map((topic) => (
              <View key={topic} style={styles.topicRow}>
                <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                <Text style={styles.topicText}>{topic}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  if (compact) {
    // Small tile for a sideways row: photo, name, price and one tap to open.
    return (
      <Pressable
        style={styles.tile}
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${name}. ${owned ? t('offers.ownedShort') : priceLabel ?? ''}`}
      >
        <View style={styles.tilePhoto}>
          {thumbnailUrl ? (
            <AppImage uri={thumbnailUrl} style={styles.thumbImage} contentFit="cover" accessibilityLabel={name} />
          ) : (
            <Text style={styles.thumbIndex}>{level ?? ''}</Text>
          )}
          {addOn ? (
            <View style={styles.tileLevel}>
              <Text style={styles.levelBadgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {badgeText}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.tileName} numberOfLines={2}>
          {name}
        </Text>
        {owned ? (
          <View style={styles.ownedPill}>
            <Ionicons name="checkmark-circle" size={14} color={colors.success} />
            <Text style={styles.ownedText}>{t('offers.ownedShort')}</Text>
          </View>
        ) : priceLabel ? (
          <Text style={styles.tilePrice}>{priceLabel}</Text>
        ) : null}
      </Pressable>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.thumb}>
          {thumbnailUrl ? (
            <AppImage uri={thumbnailUrl} style={styles.thumbImage} contentFit="cover" accessibilityLabel={name} />
          ) : (
            <Text style={styles.thumbIndex}>{level ?? ''}</Text>
          )}
        </View>
        <View style={styles.body}>
          {addOn ? (
            <View style={styles.levelBadge}>
              <Text style={styles.levelBadgeText}>{badgeText}</Text>
            </View>
          ) : null}
          <Text style={styles.name} numberOfLines={2}>
            {name}
          </Text>
          {tagline ? (
            <Text style={styles.tagline} numberOfLines={2}>
              {tagline}
            </Text>
          ) : null}
          {lessonCount != null && lessonCount > 0 ? (
            <Text style={styles.meta}>
              {lessonCount === 1 ? t('offers.lessonOne') : t('offers.lessonsShort', { count: lessonCount })}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.footer}>
        {owned ? (
          <View style={styles.ownedPill}>
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            <Text style={styles.ownedText}>{t('offers.ownedShort')}</Text>
          </View>
        ) : priceLabel ? (
          <Text style={styles.price}>{priceLabel}</Text>
        ) : (
          <View />
        )}
        <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${name}. ${t('offers.viewCourse')}`}>
          <LinearGradient
            colors={[colors.pink, colors.pinkDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.openBtn}
          >
            <Text style={styles.openBtnText}>{owned ? t('offers.openInLearn') : t('offers.viewCourse')}</Text>
          </LinearGradient>
        </Pressable>
      </View>

      {hasTopics ? (
        <>
          <Pressable
            style={styles.learnToggle}
            onPress={onToggle}
            accessibilityRole="button"
            accessibilityState={{ expanded: Boolean(expanded) }}
          >
            <Text style={styles.learnToggleText}>{t('offers.whatYouLearn')}</Text>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.pinkDark} />
          </Pressable>
          {expanded ? (
            <View style={styles.topics}>
              {topics!.map((topic) => (
                <View key={topic} style={styles.topicRow}>
                  <Ionicons name="checkmark-circle" size={15} color={colors.success} />
                  <Text style={styles.topicText}>{topic}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function createStyles(fonts: UiFonts) {
  return StyleSheet.create({
    card: {
      padding: 12,
      marginBottom: 12,
      borderRadius: 18,
      backgroundColor: colors.white,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.softBorder,
      shadowColor: '#3a1a28',
      shadowOpacity: 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 5 },
      elevation: 3,
    },
    slim: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.softBorder,
    },
    slimRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 8,
    },
    slimThumb: {
      width: 40,
      height: 40,
      borderRadius: 10,
      overflow: 'hidden',
      backgroundColor: colors.pinkMist,
      alignItems: 'center',
      justifyContent: 'center',
    },
    slimIndex: {
      fontFamily: fonts.extraBold,
      fontSize: 14,
      color: colors.pinkDark,
    },
    slimBody: {
      flex: 1,
      minWidth: 0,
    },
    slimName: {
      fontFamily: fonts.extraBold,
      fontSize: 14,
      color: colors.ink,
    },
    slimMeta: {
      fontFamily: fonts.regular,
      fontSize: 12,
      color: colors.muted,
      marginTop: 1,
    },
    slimTopics: {
      gap: 6,
      paddingBottom: 10,
      paddingLeft: 50,
    },
    tile: {
      width: 118,
      padding: 6,
      gap: 4,
      borderRadius: 16,
      backgroundColor: colors.white,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.softBorder,
      shadowColor: '#3a1a28',
      shadowOpacity: 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },
    tilePhoto: {
      width: '100%',
      height: 62,
      borderRadius: 10,
      overflow: 'hidden',
      backgroundColor: colors.pinkMist,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tileLevel: {
      position: 'absolute',
      top: 6,
      left: 6,
      maxWidth: '88%',
      paddingHorizontal: 7,
      borderRadius: 999,
      backgroundColor: colors.yellow,
    },
    tileName: {
      fontFamily: fonts.extraBold,
      fontSize: 12,
      lineHeight: 15,
      color: colors.ink,
      minHeight: 30,
    },
    tilePrice: {
      fontFamily: fonts.extraBold,
      fontSize: 16,
      color: colors.pinkDark,
    },
    row: {
      flexDirection: 'row',
      gap: 12,
    },
    thumb: {
      width: 84,
      height: 84,
      borderRadius: 14,
      overflow: 'hidden',
      backgroundColor: colors.pinkMist,
      alignItems: 'center',
      justifyContent: 'center',
    },
    thumbImage: {
      width: '100%',
      height: '100%',
    },
    thumbIndex: {
      fontFamily: fonts.extraBold,
      fontSize: 26,
      color: colors.pinkDark,
    },
    body: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    levelBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 8,
      paddingVertical: 1,
      borderRadius: 999,
      backgroundColor: colors.yellow,
    },
    levelBadgeText: {
      fontFamily: fonts.extraBold,
      fontSize: 10,
      lineHeight: 16,
      letterSpacing: 0.6,
      color: colors.ink,
    },
    name: {
      fontFamily: fonts.extraBold,
      fontSize: 16,
      lineHeight: 21,
      color: colors.ink,
    },
    tagline: {
      fontFamily: fonts.regular,
      fontSize: 12,
      lineHeight: 17,
      color: colors.muted,
    },
    meta: {
      fontFamily: fonts.semiBold,
      fontSize: 12,
      color: colors.pinkDark,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 12,
    },
    price: {
      fontFamily: fonts.extraBold,
      fontSize: 22,
      color: colors.ink,
    },
    ownedPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: radii.pill,
      backgroundColor: 'rgba(26, 122, 74, 0.1)',
    },
    ownedText: {
      fontFamily: fonts.extraBold,
      fontSize: 12,
      color: colors.success,
    },
    openBtn: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: radii.md,
    },
    openBtnText: {
      fontFamily: fonts.extraBold,
      fontSize: 13,
      color: colors.white,
    },
    learnToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.softBorder,
    },
    learnToggleText: {
      fontFamily: fonts.extraBold,
      fontSize: 12,
      color: colors.pinkDark,
    },
    topics: {
      gap: 8,
      marginTop: 10,
      paddingHorizontal: spacing.xs,
    },
    topicRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    },
    topicText: {
      flex: 1,
      fontFamily: fonts.regular,
      fontSize: 13,
      lineHeight: 18,
      color: colors.ink,
    },
  });
}
