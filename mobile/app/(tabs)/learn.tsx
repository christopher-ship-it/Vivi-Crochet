import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCourse, listCourses } from '../../src/api/courses';
import {
  completeMyEnrollment,
  listMyEnrollments,
  type Enrollment,
} from '../../src/api/enrollments';
import { listProducts } from '../../src/api/products';
import { ApiClientError } from '../../src/api/client';
import { useShoppingSession } from '../../src/auth/SessionContext';
import { AppImage, prefetchImages } from '../../src/components/AppImage';
import { BrandWordmark } from '../../src/components/BrandWordmark';
import { CourseCard } from '../../src/components/CourseCard';
import { LearnerJourney } from '../../src/components/LearnerJourney';
import { MyViviPageGradient } from '../../src/components/MyViviPageGradient';
import { EmptyView, ErrorView, LoadingView } from '../../src/components/StateViews';
import { useTabDockClearance } from '../../src/components/PremiumTabBar';
import type { Course, CourseLesson, Product } from '../../src/types';
import { useI18n } from '../../src/i18n';
import { uiFonts, type UiFonts } from '../../src/i18n/uiFonts';
import { colors, spacing } from '../../src/theme';
import { getCoursePathCursor } from '../../src/utils/coursePathProgress';
import {
  buildLearnerJourney,
  isLastLessonInCourse,
} from '../../src/utils/learnerJourney';
import {
  selectDiscoverCourses,
  selectMainCourses,
  selectProductLinkedCourses,
  selectTrendingTutorials,
  selectViralProjects,
  type DiscoverFilter,
} from '../../src/utils/mainCourses';
import { applyStatusBar } from '../../src/utils/statusBar';

const HERO_LEARN = require('../../assets/learn-hero-section.png');
const SCREEN_WIDTH = Dimensions.get('window').width;
/**
 * Large decorative art — positioned absolutely so it does not expand
 * the hero section layout height (section height follows the glass copy).
 */
const HERO_IMAGE_WIDTH = Math.min(280, Math.round(SCREEN_WIDTH * 0.68));
const HERO_IMAGE_HEIGHT = HERO_IMAGE_WIDTH * (800 / 1200);
/** Compact hero strip — independent of image size. */
const HERO_SECTION_HEIGHT = 72;

type CourseProgress = {
  progressPct: number;
  resumeLessonId?: string;
};

function resolveCourseProgress(
  course: Course,
  cursorId: string | null,
  completedFlag = false,
): CourseProgress {
  if (completedFlag) {
    return { progressPct: 100 };
  }
  const lessons = (course.lessons ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const total = Math.max(1, lessons.length || course.videoCount || 1);
  let index = 0;
  if (cursorId && lessons.length) {
    const found = lessons.findIndex((lesson: CourseLesson) => lesson.id === cursorId);
    if (found >= 0) index = found;
  }
  const current = lessons[index];
  const onLast = Boolean(cursorId && isLastLessonInCourse(lessons, cursorId));
  const progressPct = onLast
    ? 100
    : Math.min(100, Math.max(8, Math.round(((index + 0.65) / total) * 100)));
  return {
    progressPct,
    resumeLessonId: current?.id,
  };
}

function TrendingCard({
  course,
  onPress,
  t,
  styles,
}: {
  course: Course;
  onPress: () => void;
  t: ReturnType<typeof useI18n>['t'];
  styles: ReturnType<typeof createStyles>;
}) {
  const thumb = course.thumbnailUrl?.trim();
  const level = course.level?.trim() || course.categoryName?.trim() || t('learn.courseFallback');
  const lessonMeta =
    course.videoCount === 1
      ? t('learn.lessonOne')
      : t('learn.lessonsCount', { count: course.videoCount });

  return (
    <Pressable
      style={({ pressed }) => [styles.trendCard, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={course.name}
    >
      <View style={styles.trendMedia}>
        {thumb ? (
          <AppImage uri={thumb} style={styles.trendImage} contentFit="cover" />
        ) : (
          <View style={[styles.trendImage, styles.trendFallback]}>
            <Text style={styles.trendFallbackMark}>VIVI</Text>
          </View>
        )}
        <View style={styles.trendPlay}>
          <Ionicons name="play" size={14} color={colors.white} />
        </View>
      </View>
      <Text style={styles.trendTitle} numberOfLines={2}>
        {course.name}
      </Text>
      <Text style={styles.trendMeta} numberOfLines={1}>
        {lessonMeta} · {level}
      </Text>
    </Pressable>
  );
}

export default function LearnScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dockClearance = useTabDockClearance();
  const { t, language } = useI18n();
  const fonts = uiFonts(language);
  const styles = useMemo(() => createStyles(fonts), [language]);
  const { isAuthenticated, user } = useShoppingSession();

  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [discoverFilter, setDiscoverFilter] = useState<DiscoverFilter>('all');
  const [progressByCourseId, setProgressByCourseId] = useState<Record<string, CourseProgress>>(
    {},
  );
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProgress = useCallback(
    async (mainCourses: Course[]) => {
      if (!isAuthenticated || mainCourses.length === 0) {
        setProgressByCourseId({});
        setEnrollments([]);
        return;
      }
      const pathOwnerId = user?.id ?? 'guest';
      try {
        const mine = await listMyEnrollments();
        setEnrollments(mine);
        const activeIds = new Set(
          mine.filter((item) => item.isActive && !item.isExpired).map((item) => item.courseId),
        );
        const enrolledMain = mainCourses.filter((c) => activeIds.has(c.id));
        if (enrolledMain.length === 0) {
          setProgressByCourseId({});
          return;
        }
        const entries = await Promise.all(
          enrolledMain.map(async (course) => {
            try {
              const enrollment = mine.find((e) => e.courseId === course.id);
              const [detail, cursor] = await Promise.all([
                getCourse(course.id),
                getCoursePathCursor(course.id, pathOwnerId),
              ]);
              const progress = resolveCourseProgress(
                detail,
                cursor,
                Boolean(enrollment?.completedFlag),
              );
              if (
                enrollment &&
                !enrollment.completedFlag &&
                cursor &&
                isLastLessonInCourse(detail.lessons ?? [], cursor)
              ) {
                void completeMyEnrollment(course.id).then((updated) => {
                  setEnrollments((prev) =>
                    prev.map((e) => (e.courseId === updated.courseId ? updated : e)),
                  );
                });
              }
              return [course.id, progress] as const;
            } catch {
              return [course.id, { progressPct: 8 }] as const;
            }
          }),
        );
        setProgressByCourseId(Object.fromEntries(entries));
      } catch {
        setProgressByCourseId({});
        setEnrollments([]);
      }
    },
    [isAuthenticated, user?.id],
  );

  useFocusEffect(
    useCallback(() => {
      applyStatusBar('dark');
      if (allCourses.length) {
        void loadProgress(selectMainCourses(allCourses));
      }
    }, [allCourses, loadProgress]),
  );

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const [everyCourse, shopProducts] = await Promise.all([
          listCourses(),
          listProducts().catch(() => [] as Product[]),
        ]);
        const main = selectMainCourses(everyCourse);
        const exclude = new Set(main.map((c) => c.id));
        await loadProgress(main);
        setAllCourses(everyCourse);
        setProducts(shopProducts);
        prefetchImages([
          ...main.map((c) => c.thumbnailUrl),
          ...selectDiscoverCourses(everyCourse, shopProducts, exclude, 'all').map(
            (c) => c.thumbnailUrl,
          ),
        ]);
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : t('learn.failedCourses'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [loadProgress, t],
  );

  useEffect(() => {
    load();
  }, [load]);

  const mainCourseIds = useMemo(
    () => new Set(selectMainCourses(allCourses).map((c) => c.id)),
    [allCourses],
  );

  const mainCourses = useMemo(() => selectMainCourses(allCourses), [allCourses]);

  const journey = useMemo(
    () => buildLearnerJourney(enrollments, progressByCourseId),
    [enrollments, progressByCourseId],
  );

  const discoverPools = useMemo(() => {
    return {
      trending: selectTrendingTutorials(allCourses, mainCourseIds),
      viral: selectViralProjects(allCourses, mainCourseIds),
      product: selectProductLinkedCourses(allCourses, products, mainCourseIds),
    };
  }, [allCourses, mainCourseIds, products]);

  const discoverChips = useMemo(() => {
    const chips: { id: DiscoverFilter; label: string; count: number }[] = [];
    const { trending, viral, product } = discoverPools;
    const total = selectDiscoverCourses(allCourses, products, mainCourseIds, 'all').length;
    if (total > 0) chips.push({ id: 'all', label: t('learn.all'), count: total });
    if (trending.length > 0) {
      chips.push({ id: 'trending', label: t('learn.trending'), count: trending.length });
    }
    if (viral.length > 0) {
      chips.push({ id: 'viral', label: t('learn.viralProjects'), count: viral.length });
    }
    if (product.length > 0) {
      chips.push({ id: 'product', label: t('learn.productLinked'), count: product.length });
    }
    return chips;
  }, [allCourses, discoverPools, mainCourseIds, products, t]);

  const discoverCourses = useMemo(() => {
    return selectDiscoverCourses(allCourses, products, mainCourseIds, discoverFilter);
  }, [allCourses, discoverFilter, mainCourseIds, products]);

  useEffect(() => {
    if (discoverChips.length === 0) return;
    if (!discoverChips.some((chip) => chip.id === discoverFilter)) {
      setDiscoverFilter(discoverChips[0].id);
    }
  }, [discoverChips, discoverFilter]);

  function openCourse(courseId: string) {
    router.push(`/course/${courseId}`);
  }

  if (loading && !refreshing) {
    return (
      <MyViviPageGradient>
        <View style={[styles.stateWrap, { paddingTop: insets.top }]}>
          <View style={styles.topBar}>
            <BrandWordmark />
            <Text style={styles.topAcademy}>{t('learn.academy')}</Text>
          </View>
          <LoadingView message={t('learn.loadingCourses')} />
        </View>
      </MyViviPageGradient>
    );
  }

  if (error && allCourses.length === 0) {
    return (
      <MyViviPageGradient>
        <View style={[styles.stateWrap, { paddingTop: insets.top }]}>
          <View style={styles.topBar}>
            <BrandWordmark />
            <Text style={styles.topAcademy}>{t('learn.academy')}</Text>
          </View>
          <ErrorView message={error} onRetry={() => load()} />
        </View>
      </MyViviPageGradient>
    );
  }

  return (
    <MyViviPageGradient>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: dockClearance + 24 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={colors.pink}
            />
          }
        >
          <View style={styles.topBar}>
            <BrandWordmark />
            <Text style={styles.topAcademy}>{t('learn.academy')}</Text>
          </View>

          <View style={styles.heroBanner}>
            <Image
              source={HERO_LEARN}
              style={[
                styles.heroBannerImage,
                { width: HERO_IMAGE_WIDTH, height: HERO_IMAGE_HEIGHT },
              ]}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
              accessibilityLabel={t('learn.heroA11y')}
            />

            <View style={styles.heroGlassWrap} pointerEvents="none">
              {Platform.OS === 'ios' ? (
                <BlurView intensity={28} tint="light" style={styles.heroGlass}>
                  <Text
                    style={styles.heroHeading}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                  >
                    {t('learn.title')}
                  </Text>
                  <Text style={styles.heroTagline} numberOfLines={2}>
                    {t('learn.introSub')}
                  </Text>
                </BlurView>
              ) : (
                <View style={[styles.heroGlass, styles.heroGlassAndroid]}>
                  <Text
                    style={styles.heroHeading}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                  >
                    {t('learn.title')}
                  </Text>
                  <Text style={styles.heroTagline} numberOfLines={2}>
                    {t('learn.introSub')}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {error ? (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>{error}</Text>
              <Pressable onPress={() => load(true)} hitSlop={8}>
                <Text style={styles.bannerAction}>{t('learn.retry')}</Text>
              </Pressable>
            </View>
          ) : null}

          {isAuthenticated ? (
            <View style={styles.journeyWrap}>
              <LearnerJourney
                journey={journey}
                variant="learn"
                onPressMilestone={(courseId) => openCourse(courseId)}
                onPressCta={(courseId) => {
                  if (courseId) openCourse(courseId);
                  else if (mainCourses[0]?.id) openCourse(mainCourses[0].id);
                }}
              />
            </View>
          ) : null}

          <View
            style={[
              styles.section,
              isAuthenticated ? styles.mainSectionAfterJourney : styles.mainSection,
            ]}
          >
            <View style={styles.sectionHead}>
              <Text style={styles.sectionIndex}>01</Text>
              <View style={styles.sectionHeadCopy}>
                <Text style={styles.sectionTitle}>{t('learn.mainCourses')}</Text>
                <Text style={styles.sectionSub}>{t('learn.mainCoursesSub')}</Text>
              </View>
            </View>

            {mainCourses.length === 0 ? (
              <EmptyView
                title={t('learn.noCoursesYetTitle')}
                message={t('learn.noCoursesAcademyMessage')}
              />
            ) : (
              <View style={styles.mainList}>
                {mainCourses.map((course) => {
                  const progress = progressByCourseId[course.id];
                  const hasAccess = Boolean(progress);
                  return (
                    <CourseCard
                      key={course.id}
                      course={course}
                      variant="editorial"
                      hasAccess={hasAccess}
                      progressPct={progress?.progressPct ?? null}
                      onPress={() => openCourse(course.id)}
                    />
                  );
                })}
              </View>
            )}
          </View>

          {discoverChips.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionIndexSecondary}>02</Text>
                <View style={styles.sectionHeadCopy}>
                  <Text style={styles.sectionTitleSecondary}>{t('learn.discover')}</Text>
                  <Text style={styles.sectionSub}>{t('learn.discoverSub')}</Text>
                </View>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.discoverChips}
              >
                {discoverChips.map((chip) => {
                  const selected = discoverFilter === chip.id;
                  return (
                    <Pressable
                      key={chip.id}
                      style={[styles.discoverChip, selected && styles.discoverChipActive]}
                      onPress={() => setDiscoverFilter(chip.id)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected }}
                    >
                      <Text
                        style={[
                          styles.discoverChipText,
                          selected && styles.discoverChipTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {chip.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

            {discoverCourses.length === 0 ? null : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.trendRail}
              >
                {discoverCourses.map((course) => (
                  <TrendingCard
                    key={`discover-${course.id}`}
                    course={course}
                    onPress={() => openCourse(course.id)}
                    t={t}
                    styles={styles}
                  />
                ))}
              </ScrollView>
            )}
            </View>
          ) : null}
        </ScrollView>
      </View>
    </MyViviPageGradient>
  );
}

function createStyles(fonts: UiFonts) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    scroll: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    stateWrap: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    pressed: {
      opacity: 0.92,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: 6,
      gap: 12,
      zIndex: 5,
      elevation: 5,
    },
    topAcademy: {
      fontFamily: fonts.semiBold,
      fontSize: 11,
      letterSpacing: 0.8,
      color: colors.muted,
      textTransform: 'uppercase',
      flexShrink: 1,
      textAlign: 'right',
      backgroundColor: 'rgba(255, 248, 250, 0.72)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      overflow: 'hidden',
    },
    heroBanner: {
      position: 'relative',
      marginHorizontal: spacing.md,
      marginTop: 2,
      marginBottom: 0,
      height: HERO_SECTION_HEIGHT,
      justifyContent: 'center',
      overflow: 'visible',
      zIndex: 1,
    },
    heroBannerImage: {
      position: 'absolute',
      right: -10,
      /** Keep art below the top bar — never grow upward into Crochet Academy. */
      top: 0,
      zIndex: 0,
    },
    heroGlassWrap: {
      zIndex: 2,
      maxWidth: '58%',
      alignSelf: 'flex-start',
    },
    heroGlass: {
      borderRadius: 12,
      overflow: 'hidden',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255, 255, 255, 0.55)',
      backgroundColor: 'rgba(255, 255, 255, 0.28)',
    },
    heroGlassAndroid: {
      backgroundColor: 'rgba(255, 248, 250, 0.78)',
    },
    heroHeading: {
      fontFamily: fonts.heading,
      fontSize: 26,
      lineHeight: 30,
      color: colors.ink,
      flexShrink: 1,
    },
    heroTagline: {
      fontFamily: fonts.regular,
      fontSize: 12,
      lineHeight: 16,
      color: colors.muted,
      marginTop: 2,
    },
    banner: {
      marginHorizontal: spacing.md,
      marginTop: spacing.sm,
      backgroundColor: colors.pinkSoft,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: 4,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    bannerText: {
      flex: 1,
      fontFamily: fonts.regular,
      fontSize: 12,
      color: colors.ink,
    },
    bannerAction: {
      fontFamily: fonts.semiBold,
      fontSize: 12,
      color: colors.pink,
    },
    section: {
      marginTop: spacing.lg,
      paddingHorizontal: spacing.md,
    },
    journeyWrap: {
      marginTop: spacing.xl + 40,
      paddingHorizontal: spacing.md,
    },
    mainSection: {
      marginTop: spacing.xl + 48,
    },
    mainSectionAfterJourney: {
      marginTop: spacing.lg,
    },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginBottom: 14,
    },
    sectionIndex: {
      fontFamily: fonts.display,
      fontSize: 22,
      lineHeight: 26,
      color: colors.pink,
      minWidth: 28,
    },
    sectionIndexSecondary: {
      fontFamily: fonts.display,
      fontSize: 18,
      lineHeight: 22,
      color: colors.muted,
      minWidth: 28,
      opacity: 0.7,
    },
    sectionHeadCopy: {
      flex: 1,
      minWidth: 0,
    },
    sectionTitle: {
      fontFamily: fonts.display,
      fontSize: 24,
      lineHeight: 28,
      color: colors.ink,
    },
    sectionTitleSecondary: {
      fontFamily: fonts.display,
      fontSize: 20,
      lineHeight: 24,
      color: colors.ink,
    },
    sectionSub: {
      fontFamily: fonts.regular,
      fontSize: 13,
      lineHeight: 18,
      color: colors.muted,
      marginTop: 4,
    },
    mainList: {
      gap: 10,
    },
    discoverChips: {
      gap: 8,
      paddingBottom: 14,
      paddingRight: spacing.md,
    },
    discoverChip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 2,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.white,
    },
    discoverChipActive: {
      borderColor: colors.pink,
      backgroundColor: colors.pinkSoft,
    },
    discoverChipText: {
      fontFamily: fonts.semiBold,
      fontSize: 12,
      color: colors.muted,
    },
    discoverChipTextActive: {
      color: colors.pinkDark,
    },
    trendRail: {
      gap: 12,
      paddingRight: spacing.md,
    },
    trendCard: {
      width: 148,
    },
    trendMedia: {
      width: 148,
      height: 96,
      borderRadius: 2,
      overflow: 'hidden',
      backgroundColor: colors.mediaWash,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    trendImage: {
      width: '100%',
      height: '100%',
    },
    trendFallback: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    trendFallbackMark: {
      fontFamily: fonts.display,
      fontSize: 16,
      color: colors.ink,
    },
    trendPlay: {
      position: 'absolute',
      left: 8,
      bottom: 8,
      width: 26,
      height: 26,
      borderRadius: 2,
      backgroundColor: 'rgba(232, 33, 91, 0.92)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    trendTitle: {
      fontFamily: fonts.semiBold,
      fontSize: 13,
      lineHeight: 17,
      color: colors.ink,
      marginTop: 8,
      minHeight: 34,
    },
    trendMeta: {
      fontFamily: fonts.regular,
      fontSize: 11,
      color: colors.muted,
      marginTop: 2,
    },
  });
}
