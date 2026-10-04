import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCourse, listCourses } from '../../src/api/courses';
import { listMyEnrollments } from '../../src/api/enrollments';
import {
  formatLiveClassWeekRange,
  listLiveWeeks,
  sortSlotsByTime,
  type LiveSlotAvailability,
  type LiveWeekSummary,
} from '../../src/api/live';
import { getIntroVideo } from '../../src/api/introVideo';
import { listProducts } from '../../src/api/products';
import { useShoppingSession } from '../../src/auth/SessionContext';
import { useCart } from '../../src/cart/CartContext';
import { BrandWordmark } from '../../src/components/BrandWordmark';
import { IntroPreviewCard } from '../../src/components/IntroPreviewCard';
import { IntroVideoModal } from '../../src/components/IntroVideoModal';
import { hasSeenIntroPreview, markIntroPreviewSeen } from '../../src/introVideo/storage';
import { MyViviPageGradient } from '../../src/components/MyViviPageGradient';
import { RoomSlideshow, type SlideItem } from '../../src/components/RoomSlideshow';
import { useTabDockClearance } from '../../src/components/PremiumTabBar';
import type { Course, Product } from '../../src/types';
import { useI18n, type TranslationKey } from '../../src/i18n';
import { uiFonts, type UiFonts } from '../../src/i18n/uiFonts';
import { colors, spacing } from '../../src/theme';
import { selectDiscoverCourses, selectMainCourses } from '../../src/utils/mainCourses';
import { getCoursePathCursor } from '../../src/utils/coursePathProgress';
import { formatCoursePrice } from '../../src/utils/format';
import { applyStatusBar } from '../../src/utils/statusBar';

const GAP = 10;
const MAX_SLIDES = 8;

type ResumeInfo = {
  courseId: string;
  courseName: string;
  lessonId: string;
  current: number;
  total: number;
  pct: number;
};

const LEARN_CHIP_ICONS = ['heart-outline', 'flower-outline', 'ribbon-outline'] as const;

/** Display hours when the API sends none. */
const SLOT_FALLBACK_HOURS: Record<string, string> = {
  Morning: '10:00 AM – 12:00 PM',
  Evening: '6:00 PM – 8:00 PM',
};

/** Shown until the week loads; once it does, the week's own sessions (including any additional ones) are used. */
const DEFAULT_LIVE_SLOTS = ['Morning', 'Evening'] as const;

/** The Home card has room for three session chips; the Live tab lists them all. */
const MAX_HOME_LIVE_SLOTS = 3;

/** "10:00 AM – 12:00 PM" → "10 AM–12 PM" so it fits a small chip. */
function compactHours(hours: string, dropMeridiem = false): string {
  const m = hours.match(/(\d{1,2})(?::\d{2})?\s*(AM|PM)?\s*[–-]\s*(\d{1,2})(?::\d{2})?\s*(AM|PM)?/i);
  if (!m) return hours;
  const [, start, startMer, end, endMer] = m;
  // Tamil / Hindi rows are narrower; "காலை / सुबह" already says morning vs evening.
  if (dropMeridiem) return `${start}–${end}`;
  return `${start}${startMer ? ` ${startMer.toUpperCase()}` : ''}–${end}${endMer ? ` ${endMer.toUpperCase()}` : ''}`;
}

/** Round-robin across categories so the Shop card shows variety, not one category. */
function pickShopSlides(products: Product[]): SlideItem[] {
  const byCategory = new Map<string, SlideItem[]>();
  for (const product of products) {
    if (product.status && product.status !== 'Published') continue;
    const imageUrl = product.imageUrl?.trim();
    if (!imageUrl) continue;
    const list = byCategory.get(product.category) ?? [];
    list.push({ id: product.id, imageUrl, label: product.name, price: product.price });
    byCategory.set(product.category, list);
  }
  const lists = [...byCategory.values()];
  const picked: SlideItem[] = [];
  for (let round = 0; picked.length < MAX_SLIDES; round += 1) {
    let added = false;
    for (const list of lists) {
      if (list[round] && picked.length < MAX_SLIDES) {
        picked.push(list[round]);
        added = true;
      }
    }
    if (!added) break;
  }
  return picked;
}

/** Same pool as Learn → Discover → All (trending, viral, kit-linked). */
function pickProjectSlides(courses: Course[], products: Product[]): SlideItem[] {
  const mainIds = new Set(selectMainCourses(courses).map((c) => c.id));
  return selectDiscoverCourses(courses, products, mainIds, 'all')
    .filter((course) => course.thumbnailUrl?.trim())
    .slice(0, MAX_SLIDES)
    .map((course) => ({
      id: course.id,
      imageUrl: course.thumbnailUrl!.trim(),
      label: course.name,
      price: course.price,
    }));
}
/** Tall room cards: width ÷ height. */
const TALL_RATIO = 0.74;

const LEARN_IMAGE = require('../../assets/learn-hero-banner.png');
const LIVE_IMAGE = require('../../assets/live-hero-home.webp');
const SHOP_IMAGE = require('../../assets/shop-handmade-app.png');
const PROJECTS_IMAGE = require('../../assets/live-hero-yarn.png');

type Room = {
  id: 'learn' | 'live' | 'shop' | 'projects';
  href: Href;
  image: ImageSourcePropType;
  /** Card wash, top to bottom. */
  wash: readonly [string, string];
  /** Room accent: CTA pill / arrow. */
  accent: string;
  title: TranslationKey;
  sub: TranslationKey;
  cta?: TranslationKey;
  /** Pink gradient behind the button, left to right. */
  ctaGradient?: readonly [string, string];
  /** Featured rooms get a glow, a tag and a gently pulsing button. */
  featured?: boolean;
  badge?: TranslationKey;
};

const LEARN: Room = {
  id: 'learn',
  href: '/(tabs)/learn',
  image: LEARN_IMAGE,
  wash: ['#ffe3ec', '#ffc6d8'],
  accent: '#c8145a',
  title: 'home.roomLearnTitle',
  sub: 'home.roomLearnSub',
  cta: 'home.roomLearnCta',
  // Deep raspberry into brand pink.
  ctaGradient: ['#9c0f48', '#e8215b'],
  featured: true,
  badge: 'home.badgeLearn',
};

const LIVE: Room = {
  id: 'live',
  href: '/(tabs)/live',
  image: LIVE_IMAGE,
  wash: ['#ffdbe6', '#ffb9cf'],
  accent: '#e8215b',
  title: 'home.roomLiveTitle',
  sub: 'home.roomLiveSub',
  cta: 'home.roomLiveCta',
  // Light coral pink into hot pink.
  ctaGradient: ['#ff6f9b', '#ea2a64'],
  featured: true,
  badge: 'home.badgeLive',
};

const SHOP: Room = {
  id: 'shop',
  href: '/(tabs)/shop',
  image: SHOP_IMAGE,
  wash: ['#fbeadb', '#f3d6bb'],
  accent: '#7a5a3c',
  title: 'home.roomShopTitle',
  sub: 'home.roomShopSub',
};

const PROJECTS: Room = {
  id: 'projects',
  // Learn's Discover section, on the "All" filter.
  href: { pathname: '/(tabs)/learn', params: { discover: 'all' } },
  image: PROJECTS_IMAGE,
  wash: ['#efe6fa', '#dccbf3'],
  accent: '#6a4c9c',
  title: 'home.roomProjectsTitle',
  sub: 'home.roomProjectsSub',
  cta: 'home.roomProjectsCta',
  featured: true,
  badge: 'home.badgeProjects',
};

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, language } = useI18n();
  const fonts = uiFonts(language);
  const styles = useMemo(() => createStyles(fonts, language !== 'en'), [language, fonts]);
  const { itemCount } = useCart();
  const { isAuthenticated, user } = useShoppingSession();
  const dockClearance = useTabDockClearance();
  const { width } = useWindowDimensions();

  const [products, setProducts] = useState<Product[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [liveWeek, setLiveWeek] = useState<LiveWeekSummary | null>(null);
  const [resume, setResume] = useState<ResumeInfo | null>(null);
  // Welcome video: the play icon in the header, and a one-time preview after 5 seconds on Home.
  const [introUrl, setIntroUrl] = useState<string | null>(null);
  const [introOpen, setIntroOpen] = useState(false);
  const [introPreviewVisible, setIntroPreviewVisible] = useState(false);

  // Refresh the live catalogue each time Home comes into view; failures just keep the last
  // (or the static illustration), never an error state.
  useFocusEffect(
    useCallback(() => {
      applyStatusBar('dark');
      let cancelled = false;
      void listProducts()
        .then((data) => !cancelled && setProducts(data))
        .catch(() => undefined);
      void listCourses()
        .then((data) => !cancelled && setCourses(data))
        .catch(() => undefined);
      void listLiveWeeks()
        .then((weeks) => !cancelled && setLiveWeek(weeks.find((w) => w.isBookable) ?? weeks[0] ?? null))
        .catch(() => undefined);
      return () => {
        cancelled = true;
      };
    }, []),
  );

  // Ask for the welcome video each time Home is shown (its link is temporary). No video, or any failure, means no icon.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void getIntroVideo()
        .then((intro) => {
          if (!cancelled) setIntroUrl(intro.available && intro.url ? intro.url : null);
        })
        .catch(() => undefined);
      return () => {
        cancelled = true;
      };
    }, []),
  );

  // After 5 seconds on Home, show the preview once. It is marked as seen as soon as it appears, so it never returns.
  useFocusEffect(
    useCallback(() => {
      if (!introUrl) return undefined;
      let cancelled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      void hasSeenIntroPreview().then((seen) => {
        if (seen || cancelled) return;
        timer = setTimeout(() => {
          if (cancelled) return;
          void markIntroPreviewSeen();
          setIntroPreviewVisible(true);
        }, 5000);
      });
      return () => {
        cancelled = true;
        if (timer) clearTimeout(timer);
        setIntroPreviewVisible(false);
      };
    }, [introUrl]),
  );

  const mainCourses = useMemo(() => selectMainCourses(courses), [courses]);

  // Signed-in learner with a main course in progress -> "Continue lesson" on the Learn card.
  useFocusEffect(
    useCallback(() => {
      if (!isAuthenticated || mainCourses.length === 0) {
        setResume(null);
        return undefined;
      }
      let cancelled = false;
      void (async () => {
        try {
          const mine = await listMyEnrollments();
          const active = new Set(
            mine.filter((e) => e.isActive && !e.isExpired && !e.completedFlag).map((e) => e.courseId),
          );
          const target = mainCourses.find((c) => active.has(c.id));
          if (!target) {
            if (!cancelled) setResume(null);
            return;
          }
          const [detail, cursor] = await Promise.all([
            getCourse(target.id),
            getCoursePathCursor(target.id, user?.id ?? 'guest'),
          ]);
          const lessons = (detail.lessons ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
          if (lessons.length === 0) {
            if (!cancelled) setResume(null);
            return;
          }
          const index = Math.max(0, cursor ? lessons.findIndex((l) => l.id === cursor) : 0);
          const total = lessons.length;
          if (!cancelled) {
            setResume({
              courseId: target.id,
              courseName: detail.name,
              lessonId: lessons[index].id,
              current: index + 1,
              total,
              pct: Math.min(100, Math.max(8, Math.round(((index + 0.65) / total) * 100))),
            });
          }
        } catch {
          if (!cancelled) setResume(null);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [isAuthenticated, mainCourses, user?.id]),
  );

  function openResume() {
    if (!resume) return;
    router.push({
      pathname: '/lesson/[id]',
      params: { id: resume.lessonId, courseName: resume.courseName, courseId: resume.courseId },
    });
  }

  function renderLearnBody(room: Room) {
    if (resume) {
      return (
        <>
          <Text style={styles.tallSub} numberOfLines={1}>
            {t('home.learnPickUp')}
          </Text>
          <View style={styles.resumeBox}>
            <Text style={styles.resumeName} numberOfLines={1}>
              {resume.courseName}
            </Text>
            <Text style={styles.resumeLesson} numberOfLines={1}>
              {t('home.learnLessonOf', { current: resume.current, total: resume.total })}
            </Text>
            <View style={styles.resumeBar}>
              <View style={[styles.resumeBarFill, { width: `${resume.pct}%` }]} />
            </View>
          </View>
        </>
      );
    }
    if (mainCourses.length === 0) {
      return (
        <Text style={styles.tallSub} numberOfLines={2}>
          {t(room.sub)}
        </Text>
      );
    }
    return (
      <View style={styles.slotList}>
        {mainCourses.slice(0, 3).map((course, i) => (
          <Pressable
            key={course.id}
            style={({ pressed }) => [styles.slotChip, styles.slotChipTight, pressed && styles.pressed]}
            onPress={() => router.push(`/course/${course.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`${course.name}, ${formatCoursePrice(course, t('market.notAvailable'))}`}
          >
            <Ionicons name={LEARN_CHIP_ICONS[i] ?? 'ribbon-outline'} size={14} color={room.accent} />
            <Text
              style={[styles.slotLabel, styles.chipName]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {course.name.split(' ')[0]}
            </Text>
            <Text style={styles.slotSeats} numberOfLines={1}>
              {formatCoursePrice(course, t('market.notAvailable'))}
            </Text>
          </Pressable>
        ))}
      </View>
    );
  }

  const liveSlots = useMemo(() => {
    const fromWeek: Pick<LiveSlotAvailability, 'slotType' | 'name' | 'hours'>[] = liveWeek?.slots?.length
      ? sortSlotsByTime(liveWeek.slots)
      : DEFAULT_LIVE_SLOTS.map((type) => ({ slotType: type, name: type, hours: undefined }));

    return fromWeek.slice(0, MAX_HOME_LIVE_SLOTS).map((entry) => {
      const type = String(entry.slotType);
      const slot = liveWeek?.slots.find((s) => s.slotType === type);
      const full = slot
        ? slot.isBlocked === true ||
          slot.status === 'Blocked' ||
          slot.status === 'FullyBooked' ||
          slot.seatsRemaining <= 0
        : false;
      // Morning and Evening have translated labels; additional sessions use the admin's name.
      const label =
        type === 'Morning'
          ? t('home.slotMorning')
          : type === 'Evening'
            ? t('home.slotEvening')
            : entry.name || type;
      return {
        type,
        label,
        icon: (type === 'Morning'
          ? 'sunny-outline'
          : type === 'Evening'
            ? 'moon-outline'
            : 'partly-sunny-outline') as 'sunny-outline' | 'moon-outline' | 'partly-sunny-outline',
        hours: compactHours(
          entry.hours?.trim() || SLOT_FALLBACK_HOURS[type] || '',
          language !== 'en' && (type === 'Morning' || type === 'Evening'),
        ),
        full,
        seats: slot?.seatsRemaining ?? null,
      };
    });
  }, [liveWeek, language, t]);
  const liveWeekRange = liveWeek ? formatLiveClassWeekRange(liveWeek.startDate) : '';

  function openLiveSlot(type: string) {
    if (!liveWeek) {
      router.push('/(tabs)/live');
      return;
    }
    router.push({ pathname: '/(tabs)/live', params: { weekId: liveWeek.id, slot: type } });
  }

  const shopSlides = useMemo(() => pickShopSlides(products), [products]);
  const projectSlides = useMemo(() => pickProjectSlides(courses, products), [courses, products]);

  // One shared pulse drives the featured buttons and the live dot.
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled || reduce) return;
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
          ]),
        );
        loop.start();
      });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [pulse]);
  const ctaScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] });
  const dotOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });

  const cardWidth = (width - spacing.md * 2 - GAP) / 2;
  const tallHeight = Math.round(cardWidth / TALL_RATIO);
  const colsMin = tallHeight + cardWidth + GAP;

  function open(room: Room) {
    router.push(room.href);
  }

  function renderTall(room: Room, grow: number) {
    const title = t(room.title);
    return (
      <Pressable
        key={room.id}
        style={({ pressed }) => [
          styles.card,
          { flexGrow: grow, flexBasis: 0 },
          room.featured && { borderWidth: 2, borderColor: room.accent, shadowColor: room.accent, shadowOpacity: 0.32, shadowRadius: 16, elevation: 8 },
          pressed && styles.pressed,
        ]}
        onPress={() => (room.id === 'learn' && resume ? openResume() : open(room))}
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${t(room.sub)}`}
      >
        <LinearGradient
          colors={[...room.wash]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {room.badge ? (
          <View style={[styles.badge, { backgroundColor: room.accent }]}>
            {room.id === 'live' ? (
              <Animated.View style={[styles.liveDot, { opacity: dotOpacity }]} />
            ) : null}
            <Text style={styles.badgeText} numberOfLines={1}>
              {t(room.id === 'learn' && resume ? 'home.badgeWelcomeBack' : room.badge)}
            </Text>
          </View>
        ) : null}
        <View style={[styles.tallImageWrap, room.featured && styles.tallImageWrapLearn]}>
          <Image
            source={room.image}
            style={[styles.tallImage, room.featured && styles.tallImageLearn]}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        </View>
        <View style={[styles.tallBody, room.id === 'learn' && styles.tallBodyLearn, styles.tallPanel]}>
          <Text
            style={styles.tallTitle}
            numberOfLines={room.id === 'live' ? 1 : 2}
            adjustsFontSizeToFit={room.id === 'live'}
            minimumFontScale={room.id === 'live' ? 0.8 : undefined}
          >
            {room.id === 'live' ? (
              <>
                {t('home.roomLiveTitlePrefix')}
                <Text style={{ color: room.accent }}>
                  {t('home.roomLiveTitleHighlight')}
                </Text>
              </>
            ) : (
              title
            )}
          </Text>
          {room.id === 'live' ? (
            <>
              {liveWeekRange ? (
                <Text style={styles.tallSub} numberOfLines={1}>
                  {liveWeekRange}
                </Text>
              ) : null}
              <View style={styles.slotList}>
                {liveSlots.map((slot) => (
                  <Pressable
                    key={slot.type}
                    style={({ pressed }) => [
                      styles.slotChip,
                      liveSlots.length > 2 && styles.slotChipTight,
                      pressed && styles.pressed,
                    ]}
                    onPress={() => openLiveSlot(slot.type)}
                    accessibilityRole="button"
                    accessibilityLabel={`${slot.label} ${slot.hours}`}
                  >
                    <Ionicons name={slot.icon} size={14} color={room.accent} />
                    <View style={styles.slotCopy}>
                      <View style={styles.slotTopRow}>
                        <Text style={[styles.slotLabel, styles.slotLabelFlex]} numberOfLines={1}>
                          {slot.label}
                        </Text>
                        {slot.seats != null ? (
                          <Text
                            style={[styles.slotSeats, slot.full && styles.slotSeatsFull]}
                            numberOfLines={1}
                          >
                            {slot.full
                              ? t('home.slotFull')
                              : slot.seats === 1
                                ? t('home.seatOneLeft')
                                : t('home.seatsShort', { count: slot.seats })}
                          </Text>
                        ) : null}
                      </View>
                      {/* Own full-width row so the time range is never cut to "12…". */}
                      <Text style={styles.slotHours} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                        {slot.hours}
                      </Text>
                    </View>

                  </Pressable>
                ))}
              </View>
            </>
          ) : room.id === 'learn' ? (
            renderLearnBody(room)
          ) : (
            <Text style={styles.tallSub} numberOfLines={2}>
              {t(room.sub)}
            </Text>
          )}
          {room.cta ? (
            <Animated.View
              style={[
                styles.cta,
                { backgroundColor: room.ctaGradient?.[0] ?? room.accent, overflow: 'hidden' },
                (room.id === 'live' || room.id === 'learn') && styles.ctaWide,
                room.id === 'learn' && styles.ctaLearn,
                room.featured && { transform: [{ scale: ctaScale }] },
              ]}
            >
              {room.ctaGradient ? (
                <LinearGradient
                  colors={[...room.ctaGradient]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
              ) : null}
              <Text
                style={[styles.ctaText, room.id === 'live' && styles.ctaTextWide]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {room.id === 'learn' && resume ? t('home.learnContinueCta') : t(room.cta)}
              </Text>
              <Ionicons
                name="arrow-forward"
                size={room.id === 'live' ? 14 : 12}
                color={colors.white}
              />
            </Animated.View>
          ) : null}
        </View>
      </Pressable>
    );
  }

  /** Full-bleed photo slideshow with the copy set over a gradient (Shop, Viral & Trending). */
  function renderPhotoCard(room: Room, grow: number) {
    const isShop = room.id === 'shop';
    const title = t(room.title);
    const tint = isShop ? '58, 38, 23' : '40, 22, 70';
    return (
      <Pressable
        key={room.id}
        style={({ pressed }) => [
          styles.card,
          styles.projectsCard,
          { flexGrow: grow, flexBasis: 0, backgroundColor: room.wash[1] },
          pressed && styles.pressed,
        ]}
        onPress={() => open(room)}
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${t(room.sub)}`}
      >
        <View style={StyleSheet.absoluteFill}>
          <RoomSlideshow items={isShop ? shopSlides : projectSlides} fallback={room.image} bare />
        </View>
        <LinearGradient
          colors={[`rgba(${tint}, 0.28)`, `rgba(${tint}, 0)`, `rgba(${tint}, 0.55)`, `rgba(${tint}, 0.94)`]}
          locations={[0, 0.3, 0.62, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={[styles.projectsBadge, isShop && styles.shopBadge]}>
          <Ionicons name={isShop ? 'bag-handle' : 'flame'} size={11} color={colors.white} />
          <Text style={styles.badgeText} numberOfLines={1}>
            {isShop ? t('shop.handmadeHeroTitle') : t(room.badge ?? 'home.badgeProjects')}
          </Text>
        </View>
        <View style={styles.projectsBody}>
          <View style={styles.squareCopy}>
            <Text style={styles.projectsTitle} numberOfLines={3}>
              {isShop ? (
                title
              ) : (
                <>
                  {t('home.roomProjectsTitleViral')}
                  <Text style={styles.projectsTitleAccent}>{t('home.roomProjectsTitleTrending')}</Text>
                </>
              )}
            </Text>
            <Text style={styles.projectsSub} numberOfLines={2}>
              {t(room.sub)}
            </Text>
          </View>
          <View style={styles.projectsArrow}>
            <Ionicons name="arrow-forward" size={14} color={room.accent} />
          </View>
        </View>
      </Pressable>
    );
  }

  function renderSquare(room: Room, grow: number) {
    const title = t(room.title);
    return (
      <Pressable
        key={room.id}
        style={({ pressed }) => [
          styles.card,
          { flexGrow: grow, flexBasis: 0 },
          room.featured && { borderWidth: 2, borderColor: room.accent, shadowColor: room.accent, shadowOpacity: 0.32, shadowRadius: 16, elevation: 8 },
          pressed && styles.pressed,
        ]}
        onPress={() => open(room)}
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${t(room.sub)}`}
      >
        <LinearGradient
          colors={[...room.wash]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {room.badge ? (
          <View style={[styles.badge, { backgroundColor: room.accent }]}>
            <Text style={styles.badgeText} numberOfLines={1}>
              {t(room.badge)}
            </Text>
          </View>
        ) : null}
        <View
          style={[
            styles.squareImageWrap,
            room.id === 'shop' && styles.squareImageWrapShop,
            room.id === 'projects' && styles.squareImageWrapProjects,
          ]}
        >
          {room.id === 'shop' || room.id === 'projects' ? (
            <RoomSlideshow
              items={room.id === 'shop' ? shopSlides : projectSlides}
              fallback={room.image}
            />
          ) : (
            <Image
              source={room.image}
              style={styles.fill}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
          )}
        </View>
        <View style={styles.squareBody}>
          <View style={styles.squareCopy}>
            <Text style={styles.squareTitle} numberOfLines={room.id === 'projects' ? 3 : 2}>
              {room.id === 'projects' ? (
                <>
                  {t('home.roomProjectsTitleViral')}
                  <Text style={{ color: room.accent }}>
                    {t('home.roomProjectsTitleTrending')}
                  </Text>
                </>
              ) : (
                title
              )}
            </Text>
          </View>
          <View style={[styles.arrow, { backgroundColor: room.accent }]}>
            <Ionicons name="arrow-forward" size={13} color={colors.white} />
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <MyViviPageGradient>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <BrandWordmark size="sm" />
          <View style={styles.topActions}>
          {introUrl ? (
            <Pressable
              style={styles.iconBtn}
              onPress={() => {
                setIntroPreviewVisible(false);
                setIntroOpen(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('home.introPlay')}
              hitSlop={8}
            >
              <Ionicons name="play-circle-outline" size={26} color={colors.pink} />
            </Pressable>
          ) : null}
          <Pressable
            style={styles.iconBtn}
            onPress={() => router.push('/cart')}
            accessibilityRole="button"
            accessibilityLabel={
              itemCount > 0 ? t('home.cartItems', { count: itemCount }) : t('home.cart')
            }
            hitSlop={8}
          >
            <Ionicons name="bag-outline" size={22} color={colors.ink} />
            {itemCount > 0 ? (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{itemCount > 99 ? '99+' : itemCount}</Text>
              </View>
            ) : null}
          </Pressable>
          </View>
        </View>

        {introUrl && introPreviewVisible ? (
          <View pointerEvents="box-none" style={[styles.introPreviewSlot, { top: insets.top + 56 }]}>
            <IntroPreviewCard
              url={introUrl}
              onWatch={() => {
                setIntroPreviewVisible(false);
                setIntroOpen(true);
              }}
              onSkip={() => setIntroPreviewVisible(false)}
            />
          </View>
        ) : null}
        {introUrl ? <IntroVideoModal visible={introOpen} url={introUrl} onClose={() => setIntroOpen(false)} /> : null}

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: dockClearance + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.greeting}>
            <View style={styles.greetingTitleRow}>
              <Text style={styles.greetingTitle}>{t('home.greetingTitle')}</Text>
              <Ionicons name="sparkles" size={16} color={colors.pinkDark} />
            </View>
            <Text style={styles.greetingSub}>{t('home.greetingSub')}</Text>
          </View>
          <Text style={styles.heading}>{t('home.roomsHeading')}</Text>

          {/* Two staggered columns that grow to fill the screen; the natural sizes are the minimum. */}
          <View style={[styles.cols, { flexGrow: 1, flexBasis: colsMin, minHeight: colsMin }]}>
            <View style={styles.col}>
              {renderTall(LEARN, 0.7)}
              {renderPhotoCard(SHOP, 1)}
            </View>
            <View style={styles.col}>
              {renderPhotoCard(PROJECTS, 1)}
              {renderTall(LIVE, 0.7)}
            </View>
          </View>
        </ScrollView>
      </View>
    </MyViviPageGradient>
  );
}

function createStyles(fonts: UiFonts, compact = false) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    scroll: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    content: {
      flexGrow: 1,
      paddingHorizontal: spacing.md,
      gap: GAP,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
    },
    topActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    introPreviewSlot: {
      position: 'absolute',
      right: 12,
      zIndex: 20,
    },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cartBadge: {
      position: 'absolute',
      top: 4,
      right: 2,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      paddingHorizontal: 4,
      backgroundColor: colors.pink,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cartBadgeText: {
      fontFamily: fonts.extraBold,
      fontSize: 9,
      color: colors.white,
    },
    greeting: {
      paddingHorizontal: 2,
      paddingTop: 2,
    },
    greetingTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    greetingTitle: {
      fontFamily: fonts.extraBold,
      fontSize: compact ? 15 : 17,
      lineHeight: compact ? 22 : 22,
      color: colors.pinkDark,
    },
    greetingSub: {
      fontFamily: fonts.regular,
      fontSize: 13,
      lineHeight: 18,
      color: colors.muted,
    },
    heading: {
      fontFamily: fonts.extraBold,
      fontSize: compact ? 19 : 22,
      lineHeight: compact ? 27 : 29,
      color: colors.ink,
      paddingHorizontal: 2,
      paddingBottom: 6,
    },
    cols: {
      flexDirection: 'row',
      gap: GAP,
    },
    col: {
      flex: 1,
      gap: GAP,
    },
    card: {
      flex: 1,
      borderRadius: 22,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.85)',
      shadowColor: colors.pinkDark,
      shadowOpacity: 0.12,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
    },
    pressed: {
      opacity: 0.9,
      transform: [{ scale: 0.98 }],
    },
    /* Learn's photo starts higher and is scaled up more; the card keeps its height. */
    tallImageWrapLearn: {
      paddingTop: 24,
    },
    tallImageLearn: {
      transform: [{ translateY: 12 }, { scale: 1.34 }],
    },
    /* Slightly larger than the card so the cut-out fills it; edges are transparent. */
    tallImage: {
      width: '100%',
      height: '100%',
      transform: [{ scale: 1.14 }],
    },
    /* Bundled images default to their pixel size, so size them explicitly. */
    fill: {
      width: '100%',
      height: '100%',
    },
    badge: {
      position: 'absolute',
      top: 10,
      left: 10,
      zIndex: 2,
      maxWidth: '85%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 999,
    },
    liveDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.white,
    },
    badgeText: {
      fontFamily: fonts.extraBold,
      fontSize: 11,
      color: colors.white,
      flexShrink: 1,
    },
    slotList: {
      gap: 5,
      marginTop: 5,
    },
    slotChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: '#fff0f5',
      borderRadius: 10,
      paddingHorizontal: 7,
      paddingVertical: 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: '#f0b4c6',
    },
    slotCopy: {
      flex: 1,
      minWidth: 0,
    },
    slotLabel: {
      fontFamily: fonts.extraBold,
      fontSize: 11,
      lineHeight: 13,
      color: colors.ink,
    },
    slotTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 6,
    },
    slotLabelFlex: {
      flexShrink: 1,
    },
    slotHours: {
      fontFamily: fonts.regular,
      fontSize: 10,
      lineHeight: 12,
      color: colors.muted,
    },
    slotChipTight: {
      paddingVertical: 2.5,
      paddingHorizontal: 6,
      gap: 4,
    },
    chipName: {
      flex: 1,
    },
    resumeBox: {
      marginTop: 5,
      backgroundColor: '#fff0f5',
      borderRadius: 12,
      paddingHorizontal: 9,
      paddingVertical: 7,
    },
    resumeName: {
      fontFamily: fonts.regular,
      fontSize: 10.5,
      color: colors.muted,
    },
    resumeLesson: {
      fontFamily: fonts.extraBold,
      fontSize: 12,
      color: colors.ink,
      marginTop: 1,
      marginBottom: 6,
    },
    resumeBar: {
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.pinkMist,
      overflow: 'hidden',
    },
    resumeBarFill: {
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.pinkDark,
    },
    slotSeats: {
      flexShrink: 0,
      fontFamily: fonts.extraBold,
      fontSize: 10.5,
      lineHeight: compact ? 15 : undefined,
      color: colors.pinkDark,
    },
    slotSeatsFull: {
      color: colors.muted,
    },
    tallImageWrap: {
      flex: 1,
      minHeight: 56,
      paddingHorizontal: 0,
      // Clears the tag pinned to the top-left of the card.
      paddingTop: 34,
    },
    tallBody: {
      flex: 1,
      paddingHorizontal: 9,
      paddingBottom: 20,
      justifyContent: 'flex-end',
      gap: 2,
    },
    /* Learn's content sits a little higher, clear of the card's bottom edge. */
    tallBodyLearn: {
      paddingBottom: 18,
    },
    /* Frosted panel holding the copy, so the illustration above stays uncluttered. */
    tallPanel: {
      flex: 0,
      flexShrink: 0,
      marginHorizontal: 7,
      marginBottom: 7,
      paddingHorizontal: 10,
      paddingTop: 9,
      paddingBottom: 10,
      borderRadius: 16,
      backgroundColor: 'rgba(255, 255, 255, 0.78)',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.95)',
    },
    tallTitle: {
      fontFamily: fonts.extraBold,
      fontSize: compact ? 14 : 16,
      lineHeight: compact ? 20 : 20,
      color: colors.ink,
    },
    tallSub: {
      fontFamily: fonts.regular,
      fontSize: 11.5,
      lineHeight: 15,
      color: colors.muted,
    },
    cta: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginTop: 8,
      paddingHorizontal: 11,
      paddingVertical: 6,
      borderRadius: 999,
      maxWidth: '100%',
    },
    ctaWide: {
      alignSelf: 'stretch',
      justifyContent: 'center',
      marginTop: 10,
      paddingHorizontal: 8,
      paddingVertical: 12,
    },
    /* Learn's button is a touch shorter than Live's so the card keeps its height. */
    ctaLearn: {
      marginTop: 11,
      paddingVertical: 10,
    },
    ctaTextWide: {
      fontSize: 13,
      textAlign: 'center',
    },
    ctaText: {
      fontFamily: fonts.extraBold,
      fontSize: 11.5,
      color: colors.white,
      flexShrink: 1,
    },
    projectsCard: {
      justifyContent: 'flex-end',
      borderWidth: 0,
      shadowColor: '#6a4c9c',
      shadowOpacity: 0.3,
      shadowRadius: 16,
      elevation: 8,
    },
    projectsBadge: {
      position: 'absolute',
      top: 10,
      left: 10,
      zIndex: 2,
      maxWidth: '85%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: 'rgba(106, 76, 156, 0.92)',
    },
    shopBadge: {
      backgroundColor: 'rgba(122, 90, 60, 0.92)',
    },
    projectsBody: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      paddingHorizontal: 12,
      paddingBottom: 12,
    },
    projectsTitle: {
      fontFamily: fonts.extraBold,
      fontSize: compact ? 13 : 16,
      lineHeight: compact ? 19 : 21,
      color: colors.white,
      textShadowColor: 'rgba(0, 0, 0, 0.35)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    projectsTitleAccent: {
      color: '#e4d3ff',
    },
    projectsSub: {
      marginTop: 3,
      fontFamily: fonts.regular,
      fontSize: 11,
      lineHeight: 14,
      color: 'rgba(255, 255, 255, 0.82)',
    },
    projectsArrow: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.white,
    },
    squareImageWrap: {
      height: '60%',
      paddingHorizontal: 8,
      paddingTop: 8,
    },
    /* Shop's title is one line, so its photo can take more of the card. */
    squareImageWrapShop: {
      height: '76%',
      paddingTop: 6,
      paddingHorizontal: 6,
    },
    /* Up to three-line title ("Viral & " + highlighted "Trending Tutorials" wrapping),
       so less than Shop's one-liner and less than the plain two-line default. */
    squareImageWrapProjects: {
      height: '56%',
      paddingTop: 6,
      paddingHorizontal: 6,
    },
    squareBody: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 6,
      paddingHorizontal: 11,
      paddingBottom: 10,
    },
    squareCopy: {
      flex: 1,
    },
    squareTitle: {
      fontFamily: fonts.extraBold,
      fontSize: compact ? 12 : 14,
      lineHeight: compact ? 17 : 18,
      color: colors.ink,
    },
    arrow: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
