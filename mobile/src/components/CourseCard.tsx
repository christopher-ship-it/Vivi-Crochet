import { Dimensions, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Course } from '../types';
import { colors, fonts, radii, spacing } from '../theme';
import { COURSE_TYPE_LABELS, formatAccessDays, formatInr } from '../utils/format';

interface CourseCardProps {
  course: Course;
  onPress: () => void;
  /** Kept for call-site compatibility; unused in the premium layout. */
  accent?: string;
  index?: number;
  /** `list` = Learn horizontal card; `rail` = Home vertical preview card. */
  variant?: 'list' | 'rail';
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const LIST_CARD_HEIGHT = 152;
const LIST_MEDIA_WIDTH = 124;
export const COURSE_RAIL_WIDTH = Math.min(148, Math.round(SCREEN_WIDTH * 0.38));
const RAIL_IMAGE_SIZE = COURSE_RAIL_WIDTH;

function formatCardMeta(course: Course): string {
  const parts = [
    `${course.videoCount} lesson${course.videoCount === 1 ? '' : 's'}`,
  ];
  if (course.level) parts.push(course.level);
  else if (course.categoryName) parts.push(course.categoryName);
  return parts.join(' · ');
}

export function CourseCard({ course, onPress, variant = 'list' }: CourseCardProps) {
  const typeLabel = COURSE_TYPE_LABELS[course.type] ?? 'Course';
  const accessLabel = formatAccessDays(course.accessDays);
  const thumb = course.thumbnailUrl?.trim();
  const meta = formatCardMeta(course);

  if (variant === 'rail') {
    return (
      <Pressable
        style={({ pressed }) => [styles.railCard, pressed && styles.cardPressed]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${course.name}, ${formatInr(course.price)}`}
      >
        <View style={styles.railMedia}>
          {thumb ? (
            <Image
              source={{ uri: thumb }}
              style={styles.railImage}
              resizeMode="cover"
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
          <Image
            source={{ uri: thumb }}
            style={styles.mediaImage}
            resizeMode="cover"
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

const styles = StyleSheet.create({
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
    backgroundColor: colors.canvas,
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
    backgroundColor: colors.pinkMist,
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

  railCard: {
    width: COURSE_RAIL_WIDTH,
    backgroundColor: colors.white,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
    paddingBottom: 8,
  },
  railMedia: {
    width: RAIL_IMAGE_SIZE,
    height: Math.round(RAIL_IMAGE_SIZE * 0.92),
    backgroundColor: colors.canvas,
  },
  railImage: {
    width: RAIL_IMAGE_SIZE,
    height: Math.round(RAIL_IMAGE_SIZE * 0.92),
  },
  railFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.pinkMist,
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
    backgroundColor: colors.pinkSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  railArrowText: {
    fontFamily: fonts.extraBold,
    fontSize: 12,
    color: colors.pink,
    marginTop: -1,
  },
});
