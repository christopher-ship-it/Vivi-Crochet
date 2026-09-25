import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useI18n } from '../i18n';
import { uiFonts } from '../i18n/uiFonts';
import type { Course } from '../types';
import { colors, radii, spacing } from '../theme';
import { isTrendingTutorial, isViralProject } from '../utils/mainCourses';

const HERO_YARN = require('../../assets/home-hero-yarn.png');
const SCREEN_WIDTH = Dimensions.get('window').width;
const HERO_IMAGE_WIDTH = Math.min(220, SCREEN_WIDTH * 0.52);
const HERO_IMAGE_HEIGHT = HERO_IMAGE_WIDTH * (600 / 900);
const AUTO_MS = 5000;
const RESUME_MS = 6000;

type BrandSlide = { key: 'brand'; kind: 'brand' };
type CourseSlide = {
  key: 'trending' | 'viral' | 'product';
  kind: 'course';
  variant: 'trending' | 'viral' | 'product';
  course: Course;
};
type HeroSlide = BrandSlide | CourseSlide;

type Props = {
  trendingCourse: Course | null;
  viralCourse: Course | null;
  productCourse: Course | null;
  onBrandCta: () => void;
  onCourseCta: (courseId: string) => void;
};

function HeroCta({
  label,
  onPress,
  fonts,
}: {
  label: string;
  onPress: () => void;
  fonts: ReturnType<typeof uiFonts>;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <LinearGradient
        colors={[colors.pink, colors.pinkDark]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.ctaGradient}
      >
        <Text style={[styles.ctaText, { fontFamily: fonts.semiBold }]} numberOfLines={2}>
          {label}
        </Text>
        <View style={styles.ctaArrow}>
          <Ionicons name="arrow-forward" size={12} color={colors.pink} />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function CourseHeroSlide({
  course,
  eyebrow,
  subhead,
  ctaLabel,
  compact,
  largeThumb,
  showPlayButton,
  showDescription,
  fonts,
  onPress,
}: {
  course: Course;
  eyebrow: string;
  subhead?: string;
  ctaLabel: string;
  compact: boolean;
  /** Viral / Trending slides use a larger cover. */
  largeThumb?: boolean;
  /** Show a default video play affordance on the thumbnail. */
  showPlayButton?: boolean;
  /** Home Viral / Trending: prefer admin Description. */
  showDescription?: boolean;
  fonts: ReturnType<typeof uiFonts>;
  onPress: () => void;
}) {
  const slideDescription = showDescription
    ? (course.description?.trim() || course.about?.trim() || '')
    : '';

  return (
    <View style={styles.slideInner}>
      <View style={styles.courseRow}>
        <View style={styles.courseCopy}>
          <Text style={[styles.eyebrow, { fontFamily: fonts.semiBold }]}>{eyebrow}</Text>
          {subhead && !slideDescription ? (
            <Text style={[styles.courseSubhead, { fontFamily: fonts.regular }]} numberOfLines={2}>
              {subhead}
            </Text>
          ) : null}
          <Text
            style={[
              styles.courseTitle,
              {
                fontFamily: fonts.extraBold,
                fontSize: compact ? 17 : 20,
                lineHeight: compact ? 21 : 24,
              },
            ]}
            numberOfLines={2}
          >
            {course.name}
          </Text>
          {slideDescription ? (
            <Text
              style={[
                styles.courseAbout,
                styles.courseAboutExpanded,
                { fontFamily: fonts.regular },
              ]}
              numberOfLines={3}
            >
              {slideDescription}
            </Text>
          ) : !showDescription && course.about?.trim() ? (
            <Text style={[styles.courseAbout, { fontFamily: fonts.regular }]} numberOfLines={2}>
              {course.about.trim()}
            </Text>
          ) : null}
        </View>
        <View
          style={[
            styles.courseMedia,
            largeThumb && styles.courseMediaLarge,
            !course.thumbnailUrl?.trim() && styles.courseMediaFallback,
          ]}
        >
          {course.thumbnailUrl?.trim() ? (
            <Image
              source={{ uri: course.thumbnailUrl.trim() }}
              style={styles.courseImage}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <Text style={[styles.courseFallbackMark, { fontFamily: fonts.extraBold }]}>VIVI</Text>
          )}
          {showPlayButton ? (
            <View style={[styles.playBadge, largeThumb && styles.playBadgeLarge]} pointerEvents="none">
              <Ionicons name="play" size={largeThumb ? 16 : 12} color={colors.white} />
            </View>
          ) : null}
        </View>
      </View>
      <HeroCta label={ctaLabel} onPress={onPress} fonts={fonts} />
    </View>
  );
}

export function HomeHeroCarousel({
  trendingCourse,
  viralCourse,
  productCourse,
  onBrandCta,
  onCourseCta,
}: Props) {
  const { t, language } = useI18n();
  const fonts = uiFonts(language);
  const compact = language !== 'en';
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const pausedRef = useRef(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const slides = useMemo<HeroSlide[]>(() => {
    const next: HeroSlide[] = [{ key: 'brand', kind: 'brand' }];
    if (trendingCourse) {
      next.push({ key: 'trending', kind: 'course', variant: 'trending', course: trendingCourse });
    }
    if (viralCourse) {
      next.push({ key: 'viral', kind: 'course', variant: 'viral', course: viralCourse });
    }
    if (productCourse) {
      next.push({ key: 'product', kind: 'course', variant: 'product', course: productCourse });
    }
    return next;
  }, [trendingCourse, viralCourse, productCourse]);

  useEffect(() => {
    indexRef.current = 0;
    setIndex(0);
    scrollRef.current?.scrollTo({ x: 0, animated: false });
  }, [slides.length]);

  const pauseAuto = useCallback(() => {
    pausedRef.current = true;
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => {
      pausedRef.current = false;
    }, RESUME_MS);
  }, []);

  useEffect(() => {
    if (slides.length <= 1) return;
    const id = setInterval(() => {
      if (pausedRef.current) return;
      const next = (indexRef.current + 1) % slides.length;
      indexRef.current = next;
      setIndex(next);
      scrollRef.current?.scrollTo({ x: next * SCREEN_WIDTH, animated: true });
    }, AUTO_MS);
    return () => clearInterval(id);
  }, [slides.length]);

  useEffect(() => {
    return () => {
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    };
  }, []);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const next = Math.round(x / SCREEN_WIDTH);
    const clamped = Math.max(0, Math.min(slides.length - 1, next));
    indexRef.current = clamped;
    setIndex(clamped);
  };

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        onScrollBeginDrag={pauseAuto}
        onMomentumScrollEnd={onScrollEnd}
        scrollEventThrottle={16}
        contentContainerStyle={styles.scrollContent}
      >
        {slides.map((slide) => (
          <View key={slide.key} style={[styles.slide, { width: SCREEN_WIDTH }]}>
            {slide.kind === 'brand' ? (
              <View style={styles.slideInner}>
                <View
                  style={[
                    styles.brandImageWrap,
                    { width: HERO_IMAGE_WIDTH, height: HERO_IMAGE_HEIGHT },
                  ]}
                  pointerEvents="none"
                >
                  <Image
                    source={HERO_YARN}
                    style={styles.brandImage}
                    resizeMode="contain"
                    accessibilityIgnoresInvertColors
                  />
                </View>
                <View style={[styles.brandCopy, { paddingRight: HERO_IMAGE_WIDTH * 0.38 }]}>
                  <Text style={[styles.eyebrow, { fontFamily: fonts.semiBold }]}>
                    {t('home.heroEyebrow')}
                  </Text>
                  <Text
                    style={[
                      styles.brandTitle,
                      {
                        fontFamily: fonts.heading,
                        fontSize: compact ? 19 : 23,
                        lineHeight: compact ? 24 : 27,
                      },
                    ]}
                  >
                    {t('home.heroTitleLine1')}
                    {'\n'}
                    <Text
                      style={[
                        styles.brandAccent,
                        {
                          fontFamily: fonts.heading,
                          fontSize: compact ? 21 : 25,
                          lineHeight: compact ? 26 : 29,
                        },
                      ]}
                    >
                      {t('home.heroTitleAccent')}
                    </Text>
                  </Text>
                  <Text style={[styles.brandLinks, { fontFamily: fonts.regular }]}>
                    {t('tabs.learn')} · {t('tabs.shop')} · {t('tabs.live')}
                  </Text>
                </View>
                <HeroCta label={t('home.exploreCta')} onPress={onBrandCta} fonts={fonts} />
              </View>
            ) : (
              <CourseHeroSlide
                course={slide.course}
                eyebrow={
                  slide.variant === 'trending'
                    ? t('home.trendingEyebrow')
                    : slide.variant === 'viral'
                      ? t('home.viralEyebrow')
                      : t('home.productCourseEyebrow')
                }
                subhead={
                  slide.variant === 'trending'
                    ? t('home.trendingSubhead')
                    : slide.variant === 'product'
                      ? t('home.productCourseSubhead')
                      : undefined
                }
                ctaLabel={
                  slide.variant === 'trending'
                    ? t('home.watchTutorial')
                    : slide.variant === 'viral'
                      ? t('home.watchProject')
                      : t('home.exploreProductCourse')
                }
                compact={compact}
                largeThumb={slide.variant === 'viral' || slide.variant === 'trending'}
                showPlayButton={slide.variant === 'viral' || slide.variant === 'trending'}
                showDescription={slide.variant === 'viral' || slide.variant === 'trending'}
                fonts={fonts}
                onPress={() => onCourseCta(slide.course.id)}
              />
            )}
          </View>
        ))}
      </ScrollView>

      {slides.length > 1 ? (
        <View style={styles.dots} pointerEvents="none">
          {slides.map((slide, i) => (
            <View key={slide.key} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Match course category names used in admin (case-insensitive, tolerant of typos). */
export function courseMatchesCategory(course: Course, ...names: string[]): boolean {
  const current = (course.categoryName ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!current) return false;
  return names.some((name) => {
    const expected = name.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!expected) return false;
    if (current === expected) return true;
    // "Trending Projetcs" / "Trending Tutorial" should still match "Trending Tutorials"
    if (expected.startsWith('trending') && current.startsWith('trending')) return true;
    if (expected.startsWith('viral') && current.startsWith('viral')) return true;
    return current.includes(expected) || expected.includes(current);
  });
}

export function pickHeroCourse(
  courses: Course[],
  match: (course: Course) => boolean,
): Course | null {
  const matched = courses
    .filter(match)
    .sort((a, b) => {
      const order = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      if (order !== 0) return order;
      return a.name.localeCompare(b.name);
    });
  if (!matched.length) return null;
  // Prefer an ordered card that has a cover; otherwise first by display order.
  return matched.find((c) => Boolean(c.thumbnailUrl?.trim())) ?? matched[0] ?? null;
}

export function pickTrendingHeroCourse(courses: Course[]): Course | null {
  return pickHeroCourse(courses, isTrendingTutorial);
}

export function pickViralHeroCourse(courses: Course[]): Course | null {
  return pickHeroCourse(courses, isViralProject);
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    paddingBottom: 0,
  },
  scrollContent: {
    alignItems: 'flex-start',
  },
  slide: {
    paddingHorizontal: spacing.md,
  },
  slideInner: {
    paddingBottom: 0,
    justifyContent: 'flex-start',
  },
  brandImageWrap: {
    position: 'absolute',
    top: -10,
    right: -4,
    zIndex: 0,
  },
  brandImage: {
    width: '100%',
    height: '100%',
  },
  brandCopy: {
    zIndex: 1,
    maxWidth: '78%',
    marginBottom: 4,
  },
  eyebrow: {
    fontSize: 9,
    letterSpacing: 0.6,
    color: colors.pink,
  },
  courseSubhead: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  brandTitle: {
    paddingBottom: 1,
    color: colors.ink,
    marginTop: 2,
  },
  brandAccent: {
    color: colors.pink,
    fontStyle: 'italic',
  },
  brandLinks: {
    marginTop: 6,
    marginBottom: 4,
    fontSize: 12,
    color: colors.muted,
  },
  courseRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  courseCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 4,
  },
  courseTitle: {
    color: colors.ink,
    marginTop: 4,
    lineHeight: 26,
  },
  courseAbout: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  /** Viral / Trending: full description under title, wraps in the copy column only. */
  courseAboutExpanded: {
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  courseMedia: {
    width: 88,
    height: 100,
    borderRadius: radii.sm,
    overflow: 'hidden',
    backgroundColor: colors.mediaWash,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  courseMediaLarge: {
    width: 104,
    height: 120,
    borderRadius: radii.md,
  },
  courseMediaFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  courseFallbackMark: {
    fontSize: 14,
    color: colors.ink,
  },
  courseImage: {
    width: '100%',
    height: '100%',
  },
  playBadge: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(232, 33, 91, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 2,
  },
  playBadgeLarge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    left: 10,
    bottom: 10,
    paddingLeft: 3,
  },
  cta: {
    alignSelf: 'flex-start',
    marginTop: 10,
    marginBottom: 0,
    maxWidth: '92%',
  },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    paddingVertical: 8,
    paddingLeft: 14,
    paddingRight: 8,
    borderRadius: radii.pill,
    gap: 8,
  },
  ctaText: {
    flexShrink: 1,
    color: colors.white,
    fontSize: 13,
    lineHeight: 17,
  },
  ctaArrow: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  pressed: {
    opacity: 0.9,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingTop: 0,
    paddingBottom: 0,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(232, 33, 91, 0.25)',
  },
  dotActive: {
    width: 16,
    backgroundColor: colors.pink,
  },
});
