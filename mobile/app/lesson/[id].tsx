import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCourse } from '../../src/api/courses';
import { getMyEnrollment, type Enrollment } from '../../src/api/enrollments';
import { getVideo, getStreamUrl } from '../../src/api/videos';
import { ApiClientError } from '../../src/api/client';
import { useShoppingSession } from '../../src/auth/SessionContext';
import { BackButton } from '../../src/components/BackButton';
import { HeroGradient } from '../../src/components/HeroGradient';
import { LessonPlayer } from '../../src/components/LessonPlayer';
import { ErrorView, LoadingView } from '../../src/components/StateViews';
import type { Course, CourseLesson, Video } from '../../src/types';
import { colors, fonts, radii, spacing } from '../../src/theme';
import { formatDuration } from '../../src/utils/format';

type LoadPhase = 'idle' | 'metadata' | 'stream';
type AccessBlock = 'auth' | 'enrollment' | 'expired' | null;

export default function LessonScreen() {
  const { id, courseName, courseId: courseIdParam } = useLocalSearchParams<{
    id: string;
    courseName?: string;
    courseId?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useShoppingSession();
  const [video, setVideo] = useState<Video | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<LoadPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [accessBlock, setAccessBlock] = useState<AccessBlock>(null);
  const [playerKey, setPlayerKey] = useState(0);
  const [course, setCourse] = useState<Course | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);

  const lessonReturnPath = id ? `/lesson/${id}` : '/(tabs)/learn';
  const courseId = courseIdParam || video?.courseId || course?.id;
  const displayCourseName = course?.name || courseName || '';

  const loadStream = useCallback(async () => {
    if (!id) return;
    setPhase('metadata');
    setError(null);
    setAccessBlock(null);
    setStreamUrl(null);

    try {
      const videoData = await getVideo(id);
      setVideo(videoData);

      if (!videoData.isFreePreview && !isAuthenticated) {
        setAccessBlock('auth');
        setPhase('idle');
        return;
      }

      setPhase('stream');
      const stream = await getStreamUrl(id, !videoData.isFreePreview);
      setStreamUrl(stream.streamUrl);
      setPlayerKey((k) => k + 1);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === 'UNAUTHORIZED' || err.status === 401) {
          setAccessBlock('auth');
          setError(null);
        } else if (err.code === 'ACCESS_EXPIRED') {
          setAccessBlock('expired');
          setError(null);
        } else if (err.code === 'ENROLLMENT_REQUIRED' || err.status === 403) {
          setAccessBlock('enrollment');
          setError(null);
        } else if (err.code === 'VIDEO_NOT_PUBLISHED' || err.status === 404) {
          setError('This lesson is not available yet.');
        } else if (err.code === 'BLOB_MISSING' || err.code === 'UPLOAD_INCOMPLETE') {
          setError('Video file is not ready yet. Try again later.');
        } else if (err.code === 'NETWORK_ERROR' || err.code === 'TIMEOUT') {
          setError(err.message);
        } else {
          setError(err.message);
        }
      } else {
        setError('Unable to prepare this video. Try again.');
      }
    } finally {
      setPhase('idle');
    }
  }, [id, isAuthenticated]);

  // Course curriculum UI only — same getCourse / enrollment APIs as course detail.
  const loadCourseContext = useCallback(async () => {
    const resolvedCourseId = courseIdParam || video?.courseId;
    if (!resolvedCourseId) return;
    try {
      const courseData = await getCourse(resolvedCourseId);
      setCourse(courseData);
    } catch {
      // Keep lesson playable even if curriculum context fails.
    }

    if (!isAuthenticated) {
      setEnrollment(null);
      return;
    }
    try {
      setEnrollment(await getMyEnrollment(resolvedCourseId));
    } catch {
      setEnrollment(null);
    }
  }, [courseIdParam, video?.courseId, isAuthenticated]);

  useEffect(() => {
    loadStream();
  }, [loadStream]);

  useEffect(() => {
    void loadCourseContext();
  }, [loadCourseContext]);

  const handlePlayerError = useCallback(() => {
    setError('Playback failed. The stream may have expired.');
    setStreamUrl(null);
  }, []);

  const handleRetry = useCallback(() => {
    setError(null);
    setAccessBlock(null);
    loadStream();
  }, [loadStream]);

  const goStreamSignIn = useCallback(() => {
    router.push({
      pathname: '/login',
      params: { returnTo: lessonReturnPath },
    });
  }, [router, lessonReturnPath]);

  const goToCourse = useCallback(() => {
    if (courseId) {
      router.replace(`/course/${courseId}`);
      return;
    }
    router.replace('/(tabs)/learn');
  }, [router, courseId]);

  const lessons = useMemo(() => {
    return (course?.lessons ?? [])
      .filter((lesson) => lesson.status === 'Published')
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
  }, [course]);

  const currentIndex = useMemo(() => {
    if (!id || lessons.length === 0) return -1;
    return lessons.findIndex((lesson) => lesson.id === id);
  }, [id, lessons]);

  const currentLessonNumber = currentIndex >= 0 ? currentIndex + 1 : null;
  const nextLesson = currentIndex >= 0 ? lessons[currentIndex + 1] ?? null : null;

  const openLesson = useCallback(
    (lesson: CourseLesson) => {
      if (!courseId && !course?.id) return;
      router.replace({
        pathname: '/lesson/[id]',
        params: {
          id: lesson.id,
          courseName: displayCourseName,
          courseId: courseId || course?.id || '',
        },
      });
    },
    [router, courseId, course?.id, displayCourseName],
  );

  if (phase !== 'idle' && !video) {
    return <LoadingView message={phase === 'stream' ? 'Fetching stream…' : 'Loading lesson…'} />;
  }

  if (accessBlock === 'auth') {
    return (
      <>
        <Stack.Screen options={{ title: video?.title ?? 'Lesson', headerShown: true }} />
        <ErrorView
          title="Sign in to stream"
          message="Free previews play without an account. Full lessons need a one-time mobile sign-in for a secure stream link — this is not shop checkout."
          actionLabel="Verify mobile"
          onAction={goStreamSignIn}
          onRetry={loadStream}
        />
      </>
    );
  }

  if (accessBlock === 'enrollment') {
    return (
      <>
        <Stack.Screen options={{ title: video?.title ?? 'Lesson', headerShown: true }} />
        <ErrorView
          title="Course purchase required"
          message="This lesson unlocks after you buy the course. Tap below to purchase with Razorpay."
          actionLabel="Purchase course"
          onAction={goToCourse}
          onRetry={handleRetry}
        />
      </>
    );
  }

  if (accessBlock === 'expired') {
    return (
      <>
        <Stack.Screen options={{ title: video?.title ?? 'Lesson', headerShown: true }} />
        <ErrorView
          title="Access expired"
          message="Your access to this course has ended. Renew from the course page when renewal is available."
          actionLabel={courseId ? 'Back to course' : 'Browse courses'}
          onAction={goToCourse}
          onRetry={handleRetry}
        />
      </>
    );
  }

  if (error || !video) {
    return (
      <>
        <Stack.Screen options={{ title: 'Lesson', headerShown: true }} />
        <ErrorView
          title="Unable to play this lesson"
          message={error ?? 'Try again.'}
          onRetry={handleRetry}
        />
      </>
    );
  }

  const metaParts = [
    course?.level?.trim() || null,
    video.durationSeconds != null ? formatDuration(video.durationSeconds) : null,
  ].filter(Boolean);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <HeroGradient style={styles.header}>
          <BackButton onPress={() => {
            if (router.canGoBack()) router.back();
            else goToCourse();
          }} />
          <Text style={styles.headerTitle} numberOfLines={1}>
            {displayCourseName || video.title}
          </Text>
          <Pressable
            style={styles.headerBtn}
            onPress={goToCourse}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Open course"
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.ink} />
          </Pressable>
        </HeroGradient>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
          showsVerticalScrollIndicator={false}
        >
          {streamUrl ? (
            <LessonPlayer
              key={playerKey}
              streamUrl={streamUrl}
              title={video.title}
              onError={handlePlayerError}
              onRetry={handleRetry}
            />
          ) : phase === 'stream' ? (
            <LoadingView message="Fetching stream…" />
          ) : (
            <ErrorView
              title="Unable to play this lesson"
              message="Could not load the stream URL."
              onRetry={handleRetry}
            />
          )}

          <View style={styles.body}>
            {displayCourseName ? (
              <Text style={styles.courseName}>{displayCourseName.toUpperCase()}</Text>
            ) : null}

            <Text style={styles.lessonTitle}>{video.title}</Text>

            <Text style={styles.lessonMeta}>
              {[
                currentLessonNumber != null ? `Lesson ${currentLessonNumber}` : null,
                ...metaParts,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>

            {video.isFreePreview && (
              <Text style={styles.previewBadge}>Free preview lesson</Text>
            )}

            {lessons.length > 0 && currentLessonNumber != null && (
              <View style={styles.progressBlock}>
                <Text style={styles.blockLabel}>YOUR PROGRESS</Text>
                <Text style={styles.progressText}>
                  Lesson {currentLessonNumber} of {lessons.length}
                </Text>
                <View style={styles.progressDots}>
                  {lessons.map((lesson, index) => {
                    const active = lesson.id === id;
                    const past = index < currentIndex;
                    return (
                      <View
                        key={lesson.id}
                        style={[
                          styles.progressDot,
                          past && styles.progressDotPast,
                          active && styles.progressDotActive,
                        ]}
                      />
                    );
                  })}
                </View>
              </View>
            )}

            {lessons.length > 0 && (
              <View style={styles.lessonsBlock}>
                <Text style={styles.blockLabel}>LESSONS</Text>
                {lessons.map((lesson, index) => {
                  const active = lesson.id === id;
                  const num = String(index + 1).padStart(2, '0');
                  return (
                    <Pressable
                      key={lesson.id}
                      style={[styles.lessonRow, active && styles.lessonRowActive]}
                      onPress={() => {
                        if (!active) openLesson(lesson);
                      }}
                      disabled={active}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`Lesson ${index + 1}, ${lesson.title}`}
                    >
                      <Text style={[styles.lessonIcon, active && styles.lessonIconActive]}>
                        {active ? '▶' : '○'}
                      </Text>
                      <Text style={[styles.lessonNum, active && styles.lessonNumActive]}>
                        {num}
                      </Text>
                      <View style={styles.lessonRowBody}>
                        <Text
                          style={[styles.lessonRowTitle, active && styles.lessonRowTitleActive]}
                          numberOfLines={2}
                        >
                          {lesson.title}
                        </Text>
                        <Text style={styles.lessonRowMeta}>
                          {formatDuration(lesson.durationSeconds)}
                          {lesson.isFreePreview ? ' · Preview' : ''}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {nextLesson && (
              <Pressable
                style={styles.nextCard}
                onPress={() => openLesson(nextLesson)}
                accessibilityRole="button"
                accessibilityLabel={`Next lesson, ${nextLesson.title}`}
              >
                <Text style={styles.nextEyebrow}>NEXT LESSON</Text>
                <View style={styles.nextRow}>
                  <Text style={styles.nextTitle} numberOfLines={2}>
                    {nextLesson.title}
                  </Text>
                  <Text style={styles.nextCta}>Continue →</Text>
                </View>
              </Pressable>
            )}

            {enrollment?.completedFlag && (
              <View style={styles.congratsCard}>
                <Text style={styles.congratsEyebrow}>COURSE COMPLETE</Text>
                <Text style={styles.congratsTitle}>Congrats — you finished this course.</Text>
                <Pressable onPress={() => router.push('/(tabs)/learn')} hitSlop={8}>
                  <Text style={styles.congratsCta}>Browse more courses →</Text>
                </Pressable>
              </View>
            )}

            {video.description?.trim() ? (
              <View style={styles.aboutBlock}>
                <Text style={styles.blockLabel}>ABOUT THIS LESSON</Text>
                <Text style={styles.aboutText}>{video.description.trim()}</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: colors.ink,
    paddingHorizontal: 4,
  },
  scroll: {
    flex: 1,
  },
  body: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },
  courseName: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    letterSpacing: 1.4,
    color: colors.pink,
  },
  lessonTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: -0.4,
    color: colors.ink,
    marginTop: 6,
  },
  lessonMeta: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
    marginTop: 8,
  },
  previewBadge: {
    marginTop: 12,
    alignSelf: 'flex-start',
    fontFamily: fonts.semiBold,
    fontSize: 10,
    letterSpacing: 0.6,
    color: colors.pinkDark,
    backgroundColor: colors.pinkSoft,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    textTransform: 'uppercase',
    overflow: 'hidden',
  },
  progressBlock: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.softBorder,
  },
  blockLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    letterSpacing: 1.4,
    color: colors.muted,
  },
  progressText: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: colors.ink,
    marginTop: 8,
  },
  progressDots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  progressDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.softBorder,
  },
  progressDotPast: {
    backgroundColor: colors.pinkMist,
  },
  progressDotActive: {
    backgroundColor: colors.pink,
    width: 18,
    borderRadius: 5,
  },
  lessonsBlock: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.softBorder,
  },
  lessonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.softBorder,
  },
  lessonRowActive: {
    backgroundColor: colors.pinkSoft,
    marginHorizontal: -spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomColor: 'transparent',
  },
  lessonIcon: {
    width: 18,
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
  },
  lessonIconActive: {
    color: colors.pink,
  },
  lessonNum: {
    width: 28,
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.muted,
  },
  lessonNumActive: {
    color: colors.pink,
  },
  lessonRowBody: {
    flex: 1,
    minWidth: 0,
  },
  lessonRowTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    lineHeight: 18,
    color: colors.ink,
  },
  lessonRowTitleActive: {
    color: colors.ink,
  },
  lessonRowMeta: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  nextCard: {
    marginTop: spacing.lg,
    padding: 16,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  nextEyebrow: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    letterSpacing: 1.4,
    color: colors.pink,
  },
  nextRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  nextTitle: {
    flex: 1,
    fontFamily: fonts.extraBold,
    fontSize: 18,
    lineHeight: 22,
    color: colors.ink,
  },
  nextCta: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.pink,
    marginBottom: 2,
  },
  congratsCard: {
    marginTop: spacing.lg,
    padding: 16,
    borderRadius: radii.md,
    backgroundColor: colors.pinkSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.softBorder,
  },
  congratsEyebrow: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    letterSpacing: 1.4,
    color: colors.pink,
  },
  congratsTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 18,
    lineHeight: 22,
    color: colors.ink,
    marginTop: 6,
  },
  congratsCta: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.pink,
    marginTop: 12,
  },
  aboutBlock: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.softBorder,
  },
  aboutText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.muted,
    marginTop: 8,
  },
});
