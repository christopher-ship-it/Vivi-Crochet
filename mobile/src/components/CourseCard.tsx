import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Dimensions, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Course } from '../types';
import { useI18n } from '../i18n';
import { uiFonts, type UiFonts } from '../i18n/uiFonts';
import { colors, radii, spacing } from '../theme';
import { formatAccessDays, formatInr } from '../utils/format';
import { AppImage } from './AppImage';

interface CourseCardProps {
  course: Course;
  onPress: () => void;
  /** Kept for call-site compatibility; unused in the premium layout. */
  accent?: string;
  index?: number;
  /** `list` = legacy row; `rail` = Home preview; `editorial` = Learn main courses. */
  variant?: 'list' | 'rail' | 'editorial';
  /** Active enrollment progress for editorial cards. */
  progressPct?: number | null;
  hasAccess?: boolean;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const LIST_CARD_HEIGHT = 152;
const LIST_MEDIA_WIDTH = 124;
export const COURSE_RAIL_WIDTH = Math.min(148, Math.round(SCREEN_WIDTH * 0.38));
const RAIL_IMAGE_SIZE = COURSE_RAIL_WIDTH;

function formatCardMeta(course: Course): string {
  const parts = [`${course.videoCount} lesson${course.videoCount === 1 ? '' : 's'}`];
  if (course.level) parts.push(course.level);
  else if (course.categoryName) parts.push(course.categoryName);
  return parts.join(' · ');
}

function formatEditorialMeta(course: Course, lessonLabel: string): string {
  const parts = [lessonLabel];
  if (course.level?.trim()) parts.push(course.level.trim());
  if (course.accessDays > 0) {
    parts.push(`${course.accessDays} day${course.accessDays === 1 ? '' : 's'}`);
  }
  return parts.join(' · ');
}

export function CourseCard({
  course,
  onPress,
  variant = 'list',
  progressPct,
  hasAccess = false,
}: CourseCardProps) {
  const { t, language } = useI18n();
  const fonts = uiFonts(language);
  const styles = createStyles(fonts);
  const typeLabel =
    course.type === 'DigitalCourse'
      ? t('learn.courseFallback')
      : course.type === 'Bundle'
        ? 'Bundle'
        : 'Course';
  const thumb = course.thumbnailUrl?.trim();
  const meta = formatCardMeta(course);
  const lessonLabel =
    course.videoCount === 1
      ? t('learn.lessonOne')
      : t('learn.lessonsCount', { count: course.videoCount });
  const editorialMeta = formatEditorialMeta(course, lessonLabel);
  const blurb = course.about?.trim();
  const showProgress = hasAccess && progressPct != null && progressPct > 0;
  const accessLabel = formatAccessDays(course.accessDays);

  if (variant === 'editorial') {
    const body = (
      <>
        <View style={styles.editorialMedia}>
          {thumb ? (
            <AppImage
              uri={thumb}
              style={styles.editorialImage}
              contentFit="cover"
              recyclingKey={course.id}
              accessibilityLabel={course.name}
            />
          ) : (
            <View style={styles.editorialFallback}>
              <Text style={styles.editorialMark}>V</Text>
            </View>
          )}
        </View>

        <View style={styles.editorialBody}>
          <Text style={styles.editorialTitle} numberOfLines={2}>
            {course.name}
          </Text>

          {blurb ? (
            <Text style={styles.editorialBlurb} numberOfLines={2}>
              {blurb}
            </Text>
          ) : null}

          <Text style={styles.editorialMeta} numberOfLines={1}>
            {editorialMeta}
          </Text>

          {showProgress ? (
            <View style={styles.editorialProgressBlock}>
              <View style={styles.editorialProgressTrack}>
                <View
                  style={[
                    styles.editorialProgressFill,
                    { width: `${Math.min(100, Math.max(0, progressPct ?? 0))}%` },
                  ]}
                />
              </View>
              <Text style={styles.editorialProgressPct}>{progressPct}%</Text>
            </View>
          ) : null}

          <View style={styles.editorialFooter}>
            {hasAccess ? (
              <Text style={styles.editorialOwned} numberOfLines={1}>
                {t('learn.continueArrow')}
              </Text>
            ) : (
              <Text style={styles.editorialPrice}>{formatInr(course.price)}</Text>
            )}
            <Ionicons name="arrow-forward" size={16} color={colors.pink} />
          </View>
        </View>
      </>
    );

    return (
      <Pressable
        style={({ pressed }) => [styles.editorialOuter, pressed && styles.cardPressed]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${course.name}, ${formatInr(course.price)}`}
      >
        {Platform.OS === 'ios' ? (
          <BlurView intensity={26} tint="light" style={styles.editorialCard}>
            {body}
          </BlurView>
        ) : (
          <View style={[styles.editorialCard, styles.editorialCardAndroid]}>{body}</View>
        )}
      </Pressable>
    );
  }

  if (variant === 'rail') {
    const railBody = (
      <>
        <View style={styles.railMedia}>
          {thumb ? (
            <AppImage
              uri={thumb}
              style={styles.railImage}
              contentFit="cover"
              recyclingKey={course.id}
              accessibilityLabel={course.name}
            />
          ) : (
            <View style={styles.railFallback}>
              <Text style={styles.railMark}>VIVI</Text>
              <Text style={styles.railSub}>CROCHET</Text>
            </View>
          )}
        </View>

        <Text style={styles.railName} numberOfLines={1}>
          {course.name}
        </Text>
        <Text style={styles.railMeta} numberOfLines={1}>
          {meta}
        </Text>

        <View style={styles.railFooter}>
          <Text style={styles.railPrice}>{formatInr(course.price)}</Text>
          <View style={styles.railArrow}>
            <Text style={styles.railArrowText}>→</Text>
          </View>
        </View>
      </>
    );

    return (
      <Pressable
        style={({ pressed }) => [styles.railOuter, pressed && styles.cardPressed]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${course.name}, ${formatInr(course.price)}`}
      >
        {Platform.OS === 'ios' ? (
          <BlurView intensity={26} tint="light" style={styles.railCard}>
            {railBody}
          </BlurView>
        ) : (
          <View style={[styles.railCard, styles.railCardAndroid]}>{railBody}</View>
        )}
      </Pressable>
    );
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${course.name}, ${formatInr(course.price)}`}
    >
      <View style={styles.media}>
        {thumb ? (
          <AppImage
            uri={thumb}
            style={styles.mediaImage}
            contentFit="cover"
            recyclingKey={course.id}
            accessibilityLabel={course.name}
          />
        ) : (
          <View style={styles.mediaFallback}>
            <Text style={styles.mediaMark}>VIVI</Text>
            <Text style={styles.mediaSub}>CROCHET</Text>
          </View>
        )}
      </View>

      <View style={styles.body}>
        <View style={styles.bodyTop}>
          <Text style={styles.type}>{typeLabel.toUpperCase()}</Text>
          <Text style={styles.name} numberOfLines={2}>
            {course.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
          {course.about ? (
            <Text style={styles.about} numberOfLines={2}>
              {course.about}
            </Text>
          ) : null}
        </View>

        <View style={styles.footer}>
          <View style={styles.priceBlock}>
            <Text style={styles.price}>{formatInr(course.price)}</Text>
            {course.mrp != null && course.mrp > course.price ? (
              <Text style={styles.mrp}>{formatInr(course.mrp)}</Text>
            ) : null}
          </View>
          <Text style={styles.accessCta} numberOfLines={1}>
            {accessLabel} →
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function createStyles(fonts: UiFonts) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'stretch',
      height: LIST_CARD_HEIGHT,
      backgroundColor: colors.white,
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      marginBottom: spacing.md,
      overflow: 'hidden',
    },
    cardPressed: {
      opacity: 0.94,
    },
    media: {
      width: LIST_MEDIA_WIDTH,
      height: LIST_CARD_HEIGHT,
      backgroundColor: colors.mediaWash,
    },
    mediaImage: {
      width: LIST_MEDIA_WIDTH,
      height: LIST_CARD_HEIGHT,
    },
    mediaFallback: {
      width: LIST_MEDIA_WIDTH,
      height: LIST_CARD_HEIGHT,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.mediaWash,
      paddingHorizontal: 10,
    },
    mediaMark: {
      fontFamily: fonts.display,
      fontSize: 22,
      lineHeight: 26,
      color: colors.ink,
      letterSpacing: 1.2,
    },
    mediaSub: {
      fontFamily: fonts.semiBold,
      fontSize: 7,
      lineHeight: 10,
      color: colors.ink,
      letterSpacing: 3.5,
      marginTop: 2,
      opacity: 0.55,
    },
    body: {
      flex: 1,
      minWidth: 0,
      paddingTop: 12,
      paddingBottom: 12,
      paddingHorizontal: 12,
      justifyContent: 'space-between',
    },
    bodyTop: {
      flexShrink: 1,
    },
    type: {
      fontFamily: fonts.semiBold,
      fontSize: 9,
      letterSpacing: 1.4,
      color: colors.pink,
    },
    name: {
      fontFamily: fonts.semiBold,
      fontSize: 15,
      lineHeight: 20,
      color: colors.ink,
      marginTop: 3,
    },
    meta: {
      fontFamily: fonts.regular,
      fontSize: 11,
      lineHeight: 15,
      color: colors.muted,
      marginTop: 3,
    },
    about: {
      fontFamily: fonts.regular,
      fontSize: 12,
      lineHeight: 16,
      color: colors.muted,
      marginTop: 4,
    },
    footer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      marginTop: 8,
      gap: 8,
    },
    priceBlock: {
      flexShrink: 1,
    },
    price: {
      fontFamily: fonts.extraBold,
      fontSize: 16,
      color: colors.pink,
    },
    mrp: {
      fontFamily: fonts.regular,
      fontSize: 11,
      color: colors.muted,
      textDecorationLine: 'line-through',
      marginTop: 1,
    },
    accessCta: {
      fontFamily: fonts.semiBold,
      fontSize: 11,
      color: colors.pink,
      flexShrink: 1,
      textAlign: 'right',
    },

    railOuter: {
      width: COURSE_RAIL_WIDTH,
      borderRadius: 14,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255, 255, 255, 0.55)',
    },
    railCard: {
      width: COURSE_RAIL_WIDTH,
      backgroundColor: 'rgba(255, 255, 255, 0.28)',
      overflow: 'hidden',
      paddingBottom: 8,
    },
    railCardAndroid: {
      backgroundColor: 'rgba(255, 248, 250, 0.78)',
    },
    railMedia: {
      width: RAIL_IMAGE_SIZE,
      height: Math.round(RAIL_IMAGE_SIZE * 0.92),
      backgroundColor: colors.mediaWash,
    },
    railImage: {
      width: RAIL_IMAGE_SIZE,
      height: Math.round(RAIL_IMAGE_SIZE * 0.92),
    },
    railFallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255, 227, 236, 0.7)',
    },
    railMark: {
      fontFamily: fonts.display,
      fontSize: 18,
      lineHeight: 22,
      color: colors.ink,
      letterSpacing: 1.2,
    },
    railSub: {
      fontFamily: fonts.semiBold,
      fontSize: 6,
      lineHeight: 8,
      color: colors.ink,
      letterSpacing: 3,
      marginTop: 2,
      opacity: 0.55,
    },
    railName: {
      fontFamily: fonts.semiBold,
      fontSize: 13,
      lineHeight: 16,
      color: colors.ink,
      marginTop: 8,
      minHeight: 16,
      paddingHorizontal: 8,
    },
    railMeta: {
      fontFamily: fonts.regular,
      fontSize: 10,
      lineHeight: 13,
      color: colors.muted,
      marginTop: 2,
      paddingHorizontal: 8,
    },
    railFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 6,
      paddingHorizontal: 8,
    },
    railPrice: {
      fontFamily: fonts.extraBold,
      fontSize: 13,
      color: colors.pink,
    },
    railArrow: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: 'rgba(255, 240, 244, 0.85)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    railArrowText: {
      fontFamily: fonts.extraBold,
      fontSize: 12,
      color: colors.pink,
      marginTop: -1,
    },

    editorialOuter: {
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255, 255, 255, 0.55)',
    },
    editorialCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 10,
      gap: 12,
      backgroundColor: 'rgba(255, 255, 255, 0.28)',
    },
    editorialCardAndroid: {
      backgroundColor: 'rgba(255, 248, 250, 0.78)',
    },
    editorialMedia: {
      width: 88,
      height: 88,
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: colors.mediaWash,
      flexShrink: 0,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255, 255, 255, 0.45)',
    },
    editorialImage: {
      width: 88,
      height: 88,
    },
    editorialFallback: {
      width: 88,
      height: 88,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255, 227, 236, 0.7)',
    },
    editorialMark: {
      fontFamily: fonts.display,
      fontSize: 22,
      color: colors.pink,
    },
    editorialBody: {
      flex: 1,
      minWidth: 0,
      paddingRight: 2,
      justifyContent: 'center',
    },
    editorialTitle: {
      fontFamily: fonts.extraBold,
      fontSize: 14,
      lineHeight: 18,
      color: colors.ink,
      letterSpacing: 0.2,
      textTransform: 'uppercase',
    },
    editorialBlurb: {
      fontFamily: fonts.regular,
      fontSize: 12,
      lineHeight: 16,
      color: colors.muted,
      marginTop: 4,
    },
    editorialMeta: {
      fontFamily: fonts.regular,
      fontSize: 11,
      lineHeight: 14,
      color: colors.muted,
      marginTop: 6,
    },
    editorialProgressBlock: {
      marginTop: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    editorialProgressTrack: {
      flex: 1,
      height: 4,
      borderRadius: 2,
      backgroundColor: 'rgba(255, 227, 236, 0.65)',
      overflow: 'hidden',
    },
    editorialProgressFill: {
      height: '100%',
      backgroundColor: colors.pink,
    },
    editorialProgressPct: {
      fontFamily: fonts.extraBold,
      fontSize: 11,
      color: colors.pink,
      minWidth: 28,
      textAlign: 'right',
    },
    editorialFooter: {
      marginTop: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    editorialPrice: {
      fontFamily: fonts.extraBold,
      fontSize: 16,
      lineHeight: 20,
      color: colors.pink,
      flexShrink: 1,
    },
    editorialOwned: {
      fontFamily: fonts.semiBold,
      fontSize: 12,
      color: colors.pink,
      flexShrink: 1,
    },
  });
}
