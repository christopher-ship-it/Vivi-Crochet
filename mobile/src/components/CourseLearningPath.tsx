import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CourseLesson } from '../types';
import { colors, fonts, radii, shadows, spacing } from '../theme';
import { formatDuration } from '../utils/format';
import { AppImage } from './AppImage';

export type LevelStatus = 'completed' | 'current' | 'available';

type Props = {
  lessons: CourseLesson[];
  currentIndex: number;
  courseThumbnailUrl?: string | null;
  /**
   * What the learner has really watched. Null while it is loading or unavailable: the card then
   * makes no claim about progress.
   */
  progress?: PathProgress | null;
  onOpenLesson: (lesson: CourseLesson, index: number) => void;
};

export type PathProgress = {
  /** At least part of one lesson has been watched. */
  started: boolean;
  byLesson: Record<string, { percent: number; completed: boolean }>;
};

function statusFor(
  lessonId: string,
  index: number,
  currentIndex: number,
  progress: PathProgress | null,
): LevelStatus {
  if (progress) {
    if (progress.byLesson[lessonId]?.completed) return 'completed';
    return index === currentIndex ? 'current' : 'available';
  }
  if (index < currentIndex) return 'completed';
  if (index === currentIndex) return 'current';
  return 'available';
}

function StatusGlyph({ status }: { status: LevelStatus }) {
  if (status === 'completed') {
    return (
      <View style={[styles.glyph, styles.glyphDone]}>
        <Ionicons name="checkmark" size={16} color={colors.white} />
      </View>
    );
  }
  if (status === 'current') {
    return (
      <View style={[styles.glyph, styles.glyphNow]}>
        <Ionicons name="play" size={14} color={colors.white} />
      </View>
    );
  }
  return (
    <View style={[styles.glyph, styles.glyphNext]}>
      <Ionicons name="play" size={14} color={colors.pink} />
    </View>
  );
}

function ctaLabel(status: LevelStatus, progress: PathProgress | null, percent: number): string {
  if (status === 'completed') return 'Revisit this level →';
  if (status === 'current') {
    if (!progress) return 'Open this lesson →';
    if (percent > 0) return 'Continue where you left off →';
    return progress.started ? 'Start the next lesson →' : 'Start watching →';
  }
  return 'Start this level →';
}

/**
 * Unlocked course path — level cards with a vertical status timeline.
 */
export function CourseLearningPath({
  lessons,
  currentIndex,
  courseThumbnailUrl,
  progress = null,
  onOpenLesson,
}: Props) {
  return (
    <View style={styles.path}>
      {lessons.map((lesson, index) => {
        const status = statusFor(lesson.id, index, currentIndex, progress);
        const percent = progress?.byLesson[lesson.id]?.percent ?? 0;
        const isLast = index === lessons.length - 1;
        const durationLabel = formatDuration(lesson.durationSeconds);
        const hasDuration = Boolean(
          lesson.durationSeconds != null && lesson.durationSeconds > 0 && durationLabel !== '—',
        );
        const blurb =
          lesson.description?.trim() ||
          (status === 'current'
            ? percent > 0
              ? 'Pick up this lesson and keep building your stitch confidence.'
              : 'Start with this lesson and build your stitch confidence.'
            : status === 'completed'
              ? 'You finished this lesson. Revisit anytime to practice.'
              : 'Unlocked with your course access — open when you are ready.');

        return (
          <Pressable
            key={lesson.id}
            style={styles.row}
            onPress={() => onOpenLesson(lesson, index)}
            accessibilityRole="button"
            accessibilityLabel={`Level ${index + 1}, ${lesson.title}`}
          >
            <View style={styles.rail}>
              <StatusGlyph status={status} />
              {!isLast ? (
                <View
                  style={[
                    styles.spine,
                    status === 'completed' ? styles.spineDone : styles.spinePending,
                  ]}
                />
              ) : null}
            </View>

            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.cardCopy}>
                  <View style={styles.levelRow}>
                    <Text style={styles.levelLabel}>Level {index + 1}</Text>
                    {status === 'current' ? (
                      <View style={styles.nowBadge}>
                        <Text style={styles.nowText}>NOW</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {lesson.title}
                  </Text>
                  <Text style={styles.cardBody} numberOfLines={2}>
                    {blurb}
                  </Text>
                </View>

                {courseThumbnailUrl ? (
                  <AppImage uri={courseThumbnailUrl} style={styles.thumb} contentFit="cover" />
                ) : (
                  <View style={[styles.thumb, styles.thumbFallback]}>
                    <Text style={styles.thumbLetter}>{lesson.title.charAt(0)}</Text>
                  </View>
                )}
              </View>

              <View style={styles.chips}>
                {lesson.isFreePreview ? (
                  <View style={[styles.chip, styles.chipSoft]}>
                    <Text style={styles.chipText}>Free preview</Text>
                  </View>
                ) : null}
                {status === 'completed' ? (
                  <View style={[styles.chip, styles.chipDone]}>
                    <Text style={styles.chipDoneText}>Completed ✓</Text>
                  </View>
                ) : null}
                {hasDuration ? (
                  <View style={[styles.chip, styles.chipSoft]}>
                    <Text style={styles.chipText}>{durationLabel}</Text>
                  </View>
                ) : null}
              </View>

              {status === 'current' ? (
                <View style={styles.progressBlock}>
                  <Text style={styles.progressMeta}>
                    Lesson {index + 1} of {lessons.length}
                    {hasDuration ? ` · ${durationLabel}` : ''}
                    {percent > 0 ? ` · ${percent}% watched` : ''}
                  </Text>
                  {percent > 0 ? (
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${percent}%` }]} />
                    </View>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.cardFooter}>
                <Text style={styles.cta}>{ctaLabel(status, progress, percent)}</Text>
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  path: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    gap: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  rail: {
    width: 28,
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingTop: 22,
  },
  spine: {
    position: 'absolute',
    top: 50,
    bottom: -14,
    width: 2,
    left: 13,
    borderRadius: 1,
  },
  spineDone: {
    backgroundColor: 'rgba(26, 122, 74, 0.35)',
  },
  spinePending: {
    backgroundColor: colors.pinkMist,
  },
  glyph: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  glyphDone: {
    backgroundColor: colors.success,
  },
  glyphNow: {
    backgroundColor: colors.pink,
  },
  glyphNext: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.pinkMist,
  },
  card: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: 14,
    ...shadows.card,
  },
  cardTop: {
    flexDirection: 'row',
    gap: 12,
  },
  cardCopy: {
    flex: 1,
    minWidth: 0,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  levelLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    letterSpacing: 0.6,
    color: colors.muted,
    textTransform: 'uppercase',
  },
  nowBadge: {
    backgroundColor: colors.pink,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  nowText: {
    fontFamily: fonts.extraBold,
    fontSize: 9,
    letterSpacing: 0.8,
    color: colors.white,
  },
  cardTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 18,
    lineHeight: 22,
    color: colors.ink,
    letterSpacing: -0.3,
  },
  cardBody: {
    marginTop: 6,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: colors.mediaWash,
  },
  thumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbLetter: {
    fontFamily: fonts.extraBold,
    fontSize: 22,
    color: colors.pink,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  chip: {
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipSoft: {
    backgroundColor: colors.pinkSoft,
  },
  chipDone: {
    backgroundColor: '#e7f6ee',
  },
  chipText: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.pinkDark,
  },
  chipDoneText: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.success,
  },
  progressBlock: {
    marginTop: 12,
    gap: 6,
  },
  progressMeta: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.pink,
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.pinkMist,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.pink,
  },
  cardFooter: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cta: {
    flex: 1,
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.pink,
  },
});
