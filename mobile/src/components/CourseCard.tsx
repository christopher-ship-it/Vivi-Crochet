import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Course } from '../types';
import { colors, fonts, radii, shadows, spacing } from '../theme';
import { COURSE_TYPE_LABELS, formatAccessDays, formatCourseMeta, formatInr } from '../utils/format';

const CARD_ACCENTS = [colors.pink, colors.ink, '#f3e8ff', '#fff6d6'];

interface CourseCardProps {
  course: Course;
  onPress: () => void;
  accent?: string;
  index?: number;
}

export function CourseCard({ course, onPress, accent, index = 0 }: CourseCardProps) {
  const thumbBg = accent ?? CARD_ACCENTS[index % CARD_ACCENTS.length];
  const thumbInk = thumbBg === '#fff6d6' || thumbBg === '#f3e8ff' ? colors.ink : colors.white;

  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.cardPressed]} onPress={onPress}>
      <View style={[styles.thumb, { backgroundColor: thumbBg }]}>
        <Text style={[styles.thumbText, { color: thumbInk }]}>{course.name.charAt(0)}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.type}>{COURSE_TYPE_LABELS[course.type] ?? course.type}</Text>
        <Text style={styles.name} numberOfLines={2}>{course.name}</Text>
        <Text style={styles.meta}>{formatCourseMeta(course)}</Text>
        {course.about && (
          <Text style={styles.about} numberOfLines={2}>
            {course.about}
          </Text>
        )}
        <View style={styles.footer}>
          <View>
            <Text style={styles.price}>{formatInr(course.price)}</Text>
            {course.mrp && course.mrp > course.price && (
              <Text style={styles.mrp}>{formatInr(course.mrp)}</Text>
            )}
          </View>
          <View style={styles.accessPill}>
            <Text style={styles.access}>{formatAccessDays(course.accessDays)}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.softBorder,
    marginBottom: spacing.sm + 4,
    overflow: 'hidden',
    ...shadows.card,
  },
  cardPressed: {
    opacity: 0.94,
  },
  thumb: {
    width: 92,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbText: {
    fontFamily: fonts.extraBold,
    fontSize: 34,
  },
  body: {
    flex: 1,
    padding: spacing.md,
  },
  type: {
    fontFamily: fonts.semiBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.pink,
  },
  name: {
    fontFamily: fonts.extraBold,
    fontSize: 16,
    color: colors.ink,
    marginTop: 3,
    letterSpacing: -0.2,
  },
  meta: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
    marginTop: 4,
  },
  about: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    marginTop: 6,
    lineHeight: 17,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 12,
    gap: 8,
  },
  price: {
    fontFamily: fonts.extraBold,
    fontSize: 15,
    color: colors.pink,
  },
  mrp: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
    textDecorationLine: 'line-through',
    marginTop: 1,
  },
  accessPill: {
    backgroundColor: colors.canvas,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  access: {
    fontFamily: fonts.semiBold,
    fontSize: 10,
    color: colors.muted,
  },
});
