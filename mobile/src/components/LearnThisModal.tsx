import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { LinkedCourseSummary } from '../types';
import { colors, fonts, spacing } from '../theme';
import { formatInr } from '../utils/format';

interface LearnThisModalProps {
  visible: boolean;
  productName: string;
  course: LinkedCourseSummary;
  onLearn: () => void;
  onDismiss: () => void;
}

export function LearnThisModal({
  visible,
  productName,
  course,
  onLearn,
  onDismiss,
}: LearnThisModalProps) {
  const meta = [
    course.level,
    `${course.videoCount} lesson${course.videoCount === 1 ? '' : 's'}`,
    `from ${formatInr(course.price)}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.eyebrow}>LEARN & LOOP</Text>
          <Text style={styles.title}>Want to learn how to make this?</Text>
          <Text style={styles.body}>
            {productName} is handmade — you can learn to crochet it yourself in our video class.
          </Text>

          <View style={styles.courseCard}>
            <View style={styles.playIcon}>
              <Text style={styles.playIconText}>▶</Text>
            </View>
            <View style={styles.courseBody}>
              <Text style={styles.courseName}>{course.name}</Text>
              <Text style={styles.courseMeta}>{meta}</Text>
            </View>
          </View>

          <Pressable style={styles.primaryBtn} onPress={onLearn}>
            <Text style={styles.primaryText}>Learn with Vivi →</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={onDismiss}>
            <Text style={styles.secondaryText}>Not now</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(24,14,18,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.cream,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    borderTopWidth: 2,
    borderTopColor: colors.border,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
    opacity: 0.3,
  },
  eyebrow: {
    fontFamily: fonts.extraBold,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.pink,
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 20,
    color: colors.ink,
    marginTop: 6,
    lineHeight: 26,
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 20,
    marginTop: 10,
  },
  courseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.pinkSoft,
    padding: 14,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.softBorder,
  },
  playIcon: {
    width: 38,
    height: 38,
    backgroundColor: colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  playIconText: {
    color: colors.white,
    fontFamily: fonts.extraBold,
    fontSize: 14,
  },
  courseBody: {
    flex: 1,
  },
  courseName: {
    fontFamily: fonts.extraBold,
    fontSize: 15,
    color: colors.ink,
  },
  courseMeta: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
    marginTop: 3,
  },
  primaryBtn: {
    backgroundColor: colors.pink,
    borderWidth: 0,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: {
    fontFamily: fonts.extraBold,
    fontSize: 14,
    color: colors.white,
  },
  secondaryBtn: {
    marginTop: spacing.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.muted,
  },
});
