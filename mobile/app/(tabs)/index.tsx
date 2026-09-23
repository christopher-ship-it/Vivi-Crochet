import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listCourses } from '../../src/api/courses';
import { listProducts } from '../../src/api/products';
import {
  formatLiveClassWeekRange,
  listLiveWeeks,
  listMyLiveBookings,
  type LiveBooking,
  type LiveSlotAvailability,
  type LiveSlotType,
  type LiveWeekSummary,
} from '../../src/api/live';
import { ApiClientError } from '../../src/api/client';
import { useShoppingSession } from '../../src/auth/SessionContext';
import { useCart } from '../../src/cart/CartContext';
import { BrandWordmark } from '../../src/components/BrandWordmark';
import { CourseCard, COURSE_RAIL_WIDTH } from '../../src/components/CourseCard';
import {
  HomeHeroCarousel,
  pickTrendingHeroCourse,
  pickViralHeroCourse,
} from '../../src/components/HomeHeroCarousel';
import { MyViviPageGradient } from '../../src/components/MyViviPageGradient';
import { ProductAutoScrollRail } from '../../src/components/ProductAutoScrollRail';
import { LoadingView, ErrorView, EmptyView } from '../../src/components/StateViews';
import { useTabDockClearance } from '../../src/components/PremiumTabBar';
import type { Course, Product } from '../../src/types';
import { useI18n, type TranslationKey } from '../../src/i18n';
import { uiFonts, type UiFonts } from '../../src/i18n/uiFonts';
import { colors, spacing } from '../../src/theme';
import { applyStatusBar } from '../../src/utils/statusBar';
import { prefetchImages } from '../../src/components/AppImage';
import {
  selectMainCourses,
  selectProductLinkedCourses,
} from '../../src/utils/mainCourses';

/** Display times aligned with Live tab UI copy when API hours are absent. */
const SLOT_FALLBACK_HOURS: Record<string, string> = {
  Morning: '10:00 AM – 12:00 PM',
  Evening: '6:00 PM – 8:00 PM',
};

function SectionHeader({
  number,
  eyebrow,
  title,
  linkLabel,
  onLinkPress,
  styles,
}: {
  number: string;
  eyebrow: string;
  title: string;
  linkLabel: string;
  onLinkPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionNum}>{number}</Text>
      <View style={styles.sectionHeaderCopy}>
        <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
        <Text style={styles.sectionTitle} numberOfLines={2}>
          {title}
        </Text>
      </View>
      <Pressable
        style={({ pressed }) => [styles.viewAllBtn, pressed && styles.pressed]}
        onPress={onLinkPress}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={linkLabel}
      >
        <Text style={styles.viewAllText}>{linkLabel}</Text>
        <View style={styles.viewAllArrow}>
          <Ionicons name="arrow-forward" size={14} color={colors.white} />
        </View>
      </Pressable>
    </View>
  );
}

function seatsLabel(
  slot: LiveSlotAvailability,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): string {
  if (slot.status === 'FullyBooked' || slot.seatsRemaining <= 0) return t('home.fullyBooked');
  if (slot.seatsRemaining === 1) return t('home.seatAvailableOne');
  return t('home.seatsAvailable', { count: slot.seatsRemaining });
}

function slotHours(slot: LiveSlotAvailability): string {
  if (slot.hours?.trim()) return slot.hours.trim();
  return SLOT_FALLBACK_HOURS[slot.slotType] ?? '';
}

function LiveSlotPreviewCard({
  slot,
  styles,
  t,
}: {
  slot: LiveSlotAvailability;
  styles: ReturnType<typeof createStyles>;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}) {
  const isMorning = slot.slotType === 'Morning';
  const hours = slotHours(slot);
  const available =
    slot.status !== 'FullyBooked' &&
    slot.status !== 'Blocked' &&
    slot.seatsRemaining > 0;
  const label = isMorning
    ? t('home.morningCircle')
    : slot.slotType === 'Evening'
      ? t('home.eveningCircle')
      : slot.name || slot.slotType;

  return (
    <View style={[styles.liveSlotOuter, !available && styles.liveSlotCardMuted]}>
      {Platform.OS === 'ios' ? (
        <BlurView intensity={26} tint="light" style={styles.liveSlotCard}>
          <View style={styles.liveSlotTop}>
            <Ionicons
              name={isMorning ? 'sunny-outline' : 'moon-outline'}
              size={16}
              color={colors.pink}
            />
            <Text style={styles.liveSlotLabel} numberOfLines={1}>
              {label}
            </Text>
          </View>
          {hours ? (
            <Text style={styles.liveSlotHours} numberOfLines={1}>
              {hours}
            </Text>
          ) : null}
          <Text style={[styles.liveSeatsText, !available && styles.liveSeatsMuted]} numberOfLines={1}>
            {seatsLabel(slot, t)}
          </Text>
        </BlurView>
      ) : (
        <View style={[styles.liveSlotCard, styles.liveSlotCardAndroid]}>
          <View style={styles.liveSlotTop}>
            <Ionicons
              name={isMorning ? 'sunny-outline' : 'moon-outline'}
              size={16}
              color={colors.pink}
            />
            <Text style={styles.liveSlotLabel} numberOfLines={1}>
              {label}
            </Text>
          </View>
          {hours ? (
            <Text style={styles.liveSlotHours} numberOfLines={1}>
              {hours}
            </Text>
          ) : null}
          <Text style={[styles.liveSeatsText, !available && styles.liveSeatsMuted]} numberOfLines={1}>
            {seatsLabel(slot, t)}
          </Text>
        </View>
      )}
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, language } = useI18n();
  const fonts = uiFonts(language);
  const styles = useMemo(() => createStyles(fonts, language !== 'en'), [language, fonts]);
  const { itemCount } = useCart();
  const { isAuthenticated } = useShoppingSession();
  const dockClearance = useTabDockClearance();
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [coursesError, setCoursesError] = useState<string | null>(null);
  const [liveWeek, setLiveWeek] = useState<LiveWeekSummary | null>(null);
  const [liveLoading, setLiveLoading] = useState(true);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [myLiveBooking, setMyLiveBooking] = useState<LiveBooking | null>(null);
  const [productRailActive, setProductRailActive] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setProductRailActive(true);
      applyStatusBar('dark');
      if (isAuthenticated) {
        void listMyLiveBookings()
          .then((bookings) => setMyLiveBooking(bookings[0] ?? null))
          .catch(() => setMyLiveBooking(null));
      } else {
        setMyLiveBooking(null);
      }
      return () => {
        setProductRailActive(false);
        applyStatusBar('dark');
      };
    }, [isAuthenticated]),
  );

  const loadProducts = useCallback(async () => {
    setProductsLoading(true);
    setProductsError(null);
    try {
      const data = await listProducts();
      setProducts(data);
      prefetchImages(data.map((p) => p.imageUrl));
    } catch (err) {
      setProductsError(err instanceof ApiClientError ? err.message : t('home.failedProducts'));
    } finally {
      setProductsLoading(false);
    }
  }, [t]);

  const loadCourses = useCallback(async () => {
    setCoursesLoading(true);
    setCoursesError(null);
    try {
      const data = await listCourses();
      setCourses(data);
      prefetchImages(data.slice(0, 8).map((c) => c.thumbnailUrl));
    } catch (err) {
      setCoursesError(err instanceof ApiClientError ? err.message : t('home.failedCourses'));
    } finally {
      setCoursesLoading(false);
    }
  }, [t]);

  // Reuses the same live-weeks endpoint already powering the Live tab —
  // just a compact preview of the next upcoming bookable week here.
  const loadLive = useCallback(async () => {
    setLiveLoading(true);
    setLiveError(null);
    try {
      const data = await listLiveWeeks();
      setLiveWeek(data.find((w) => w.isBookable) ?? data[0] ?? null);
      if (isAuthenticated) {
        const bookings = await listMyLiveBookings().catch(() => [] as LiveBooking[]);
        setMyLiveBooking(bookings[0] ?? null);
      } else {
        setMyLiveBooking(null);
      }
    } catch (err) {
      setLiveError(err instanceof ApiClientError ? err.message : t('home.failedLive'));
    } finally {
      setLiveLoading(false);
    }
  }, [isAuthenticated, t]);

  const liveWeekRange = useMemo(
    () => (liveWeek ? formatLiveClassWeekRange(liveWeek.startDate) : ''),
    [liveWeek],
  );

  const bookedRange = useMemo(
    () => (myLiveBooking ? formatLiveClassWeekRange(myLiveBooking.startDate) : ''),
    [myLiveBooking],
  );

  const openLiveWithSlot = useCallback(
    (slot: LiveSlotType) => {
      if (!liveWeek) {
        router.push('/(tabs)/live');
        return;
      }
      router.push({
        pathname: '/(tabs)/live',
        params: { weekId: liveWeek.id, slot },
      });
    },
    [liveWeek, router],
  );

  const onPreBookLive = useCallback(() => {
    if (myLiveBooking) {
      router.push({
        pathname: '/live-booking-confirmation',
        params: { bookingId: myLiveBooking.id },
      });
      return;
    }
    if (!liveWeek) {
      router.push('/(tabs)/live');
      return;
    }
    const range = formatLiveClassWeekRange(liveWeek.startDate);
    Alert.alert(
      t('home.preBookChooseTitle'),
      t('home.preBookChooseMessage', { range }),
      [
        {
          text: t('home.morningCircle'),
          onPress: () => openLiveWithSlot('Morning'),
        },
        {
          text: t('home.eveningCircle'),
          onPress: () => openLiveWithSlot('Evening'),
        },
        { text: t('common.cancel'), style: 'cancel' },
      ],
    );
  }, [liveWeek, myLiveBooking, openLiveWithSlot, router, t]);

  useEffect(() => {
    void loadProducts();
    void loadCourses();
    void loadLive();
  }, [loadProducts, loadCourses, loadLive]);

  /** Hero slide 2 — courses in admin category “Trending Tutorials”. */
  const trendingCourse = useMemo(
    () => pickTrendingHeroCourse(courses),
    [courses],
  );

  /** Hero slide 3 — courses in admin category “Viral projects”. */
  const viralCourse = useMemo(
    () => pickViralHeroCourse(courses),
    [courses],
  );

  /** Hero slide 4 — course linked from a Shop product. */
  const productCourse = useMemo(() => {
    const mainIds = new Set(selectMainCourses(courses).map((c) => c.id));
    const linked = selectProductLinkedCourses(courses, products, mainIds);
    if (!linked.length) return null;
    return linked.find((c) => Boolean(c.thumbnailUrl?.trim())) ?? linked[0] ?? null;
  }, [courses, products]);

  /** Learn & Loop rail — only the three main structured courses. */
  const academyCourses = useMemo(() => selectMainCourses(courses), [courses]);

  const liveSlots = useMemo(() => {
    if (!liveWeek?.slots?.length) return [];
    const morning = liveWeek.slots.find((s) => s.slotType === 'Morning');
    const evening = liveWeek.slots.find((s) => s.slotType === 'Evening');
    return [morning, evening].filter(Boolean) as LiveSlotAvailability[];
  }, [liveWeek]);

  return (
    <MyViviPageGradient>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View>
          <View style={styles.topBar}>
            <BrandWordmark size="sm" />
            <View style={styles.topActions}>
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

          <HomeHeroCarousel
            trendingCourse={!coursesLoading && !coursesError ? trendingCourse : null}
            viralCourse={!coursesLoading && !coursesError ? viralCourse : null}
            productCourse={
              !coursesLoading && !coursesError && !productsLoading && !productsError
                ? productCourse
                : null
            }
            onBrandCta={() => router.push('/(tabs)/learn')}
            onCourseCta={(courseId) => router.push(`/course/${courseId}`)}
          />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: dockClearance + 24 }}
          showsVerticalScrollIndicator={false}
        >

        <View style={styles.section}>
          <SectionHeader
            number="1"
            eyebrow={t('home.learnLoopEyebrow')}
            title={t('home.crochetAcademy')}
            linkLabel={t('common.viewAll')}
            onLinkPress={() => router.push('/(tabs)/learn')}
            styles={styles}
          />

          {coursesLoading && (
            <View style={styles.inlineState}>
              <LoadingView message={t('home.loadingCourses')} />
            </View>
          )}
          {!coursesLoading && coursesError && (
            <View style={styles.inlineState}>
              <ErrorView message={coursesError} onRetry={loadCourses} />
            </View>
          )}
          {!coursesLoading && !coursesError && academyCourses.length === 0 && (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>{t('home.emptyCourses')}</Text>
            </View>
          )}
          {!coursesLoading && !coursesError && academyCourses.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              nestedScrollEnabled
              contentContainerStyle={styles.courseRail}
            >
              {academyCourses.map((course, index) => (
                <View
                  key={course.id}
                  style={[
                    styles.courseRailItem,
                    index === academyCourses.length - 1 && styles.railItemLast,
                  ]}
                >
                  <CourseCard
                    course={course}
                    variant="rail"
                    index={index}
                    onPress={() => router.push(`/course/${course.id}`)}
                  />
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        <View style={styles.section}>
          <SectionHeader
            number="2"
            eyebrow={t('home.liveStudioEyebrow')}
            title={t('home.liveTitle')}
            linkLabel={t('home.viewLive')}
            onLinkPress={() => router.push('/(tabs)/live')}
            styles={styles}
          />

          {liveLoading && (
            <View style={styles.inlineStateSmall}>
              <LoadingView message={t('home.loadingLive')} />
            </View>
          )}
          {!liveLoading && liveError && (
            <View style={styles.inlineStateSmall}>
              <ErrorView message={liveError} onRetry={loadLive} />
            </View>
          )}
          {!liveLoading && !liveError && !liveWeek && (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>{t('home.emptyLive')}</Text>
            </View>
          )}
          {!liveLoading && !liveError && liveWeek && (
            <View style={styles.livePreview}>
              {liveWeekRange ? (
                <Text style={styles.liveWeekRange}>
                  {t('home.nextAvailableWeek', { range: liveWeekRange })}
                </Text>
              ) : null}

              {liveSlots.length > 0 ? (
                <View style={styles.liveSlotsRow}>
                  {liveSlots.map((slot) => (
                    <Pressable
                      key={slot.slotType}
                      style={styles.liveSlotWrap}
                      onPress={() =>
                        openLiveWithSlot(
                          slot.slotType === 'Evening' ? 'Evening' : 'Morning',
                        )
                      }
                      accessibilityRole="button"
                      accessibilityLabel={
                        slot.slotType === 'Evening'
                          ? t('home.eveningCircle')
                          : t('home.morningCircle')
                      }
                    >
                      <LiveSlotPreviewCard slot={slot} styles={styles} t={t} />
                    </Pressable>
                  ))}
                </View>
              ) : (
                <View style={styles.liveWeekFallback}>
                  <Text style={styles.liveWeekLabel}>
                    {t('home.weekLabel', { number: liveWeek.weekNumber })}
                  </Text>
                  <Text style={styles.liveWeekHint}>
                    {liveWeek.isBookable ? t('home.openForBooking') : t('home.viewSchedule')}
                  </Text>
                </View>
              )}

              <Pressable
                style={({ pressed }) => [styles.preBookCta, pressed && styles.pressed]}
                onPress={onPreBookLive}
                accessibilityRole="button"
                accessibilityLabel={
                  myLiveBooking
                    ? t('home.bookedSessionCta', { range: bookedRange })
                    : t('home.preBookSession')
                }
              >
                <View style={styles.preBookCtaCopy}>
                  <Text style={styles.preBookCtaText} numberOfLines={2}>
                    {myLiveBooking
                      ? t('home.bookedSessionCta', { range: bookedRange })
                      : t('home.preBookSession')}
                  </Text>
                  {myLiveBooking ? (
                    <Text style={styles.preBookCtaSub} numberOfLines={1}>
                      {t('home.bookedSessionReady', {
                        circle: myLiveBooking.slotName || myLiveBooking.slotType,
                      })}
                    </Text>
                  ) : null}
                </View>
                <Ionicons name="arrow-forward" size={16} color={colors.pink} />
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <SectionHeader
            number="3"
            eyebrow={t('home.shopEyebrow')}
            title={t('home.shopTitle')}
            linkLabel={t('home.shopAll')}
            onLinkPress={() => router.push('/(tabs)/shop')}
            styles={styles}
          />

          {productsLoading && (
            <View style={styles.shopInlineState}>
              <LoadingView message={t('home.loadingProducts')} />
            </View>
          )}
          {!productsLoading && productsError && (
            <View style={styles.shopInlineState}>
              <ErrorView message={productsError} onRetry={loadProducts} />
            </View>
          )}
          {!productsLoading && !productsError && products.length === 0 && (
            <View style={styles.shopInlineState}>
              <EmptyView title={t('home.noProductsTitle')} message={t('home.noProductsMessage')} />
            </View>
          )}
          {!productsLoading && !productsError && products.length > 0 && (
            <ProductAutoScrollRail
              products={products}
              isActive={productRailActive}
              onProductPress={(id) => router.push(`/product/${id}`)}
            />
          )}
        </View>
      </ScrollView>
      </View>
    </MyViviPageGradient>
  );
}

function createStyles(fonts: UiFonts, compactHero = false) {
  return StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scroll: {
    flex: 1,
    backgroundColor: 'transparent',
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
  section: {
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: spacing.md,
    marginBottom: 12,
  },
  sectionNum: {
    fontFamily: fonts.extraBold,
    fontSize: 28,
    lineHeight: 30,
    color: colors.pink,
    width: 22,
  },
  sectionHeaderCopy: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
  },
  sectionEyebrow: {
    fontFamily: fonts.semiBold,
    fontSize: 10,
    letterSpacing: 1.4,
    color: colors.pink,
  },
  sectionTitle: {
    fontFamily: fonts.extraBold,
    fontSize: compactHero ? 14 : 17,
    lineHeight: compactHero ? 19 : 21,
    letterSpacing: -0.3,
    color: colors.ink,
    marginTop: 2,
    flexShrink: 1,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 2,
  },
  viewAllText: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.pink,
  },
  viewAllArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  courseRail: {
    paddingHorizontal: spacing.md,
  },
  courseRailItem: {
    width: COURSE_RAIL_WIDTH,
    marginRight: 10,
  },
  railItemLast: {
    marginRight: 0,
  },
  inlineState: {
    minHeight: 88,
    overflow: 'hidden',
  },
  inlineStateSmall: {
    minHeight: 64,
    overflow: 'hidden',
  },
  shopInlineState: {
    minHeight: 64,
    overflow: 'hidden',
  },
  emptyWrap: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
  },
  livePreview: {
    paddingHorizontal: spacing.md,
    gap: 10,
  },
  liveWeekRange: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink,
  },
  liveSlotsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  liveSlotWrap: {
    flex: 1,
  },
  liveSlotOuter: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.55)',
  },
  liveSlotCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  liveSlotCardAndroid: {
    backgroundColor: 'rgba(255, 248, 250, 0.78)',
  },
  liveSlotCardMuted: {
    opacity: 0.72,
  },
  liveSlotTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  liveSlotLabel: {
    flex: 1,
    fontFamily: fonts.semiBold,
    fontSize: 13,
    lineHeight: 17,
    color: colors.ink,
  },
  liveSlotName: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    lineHeight: 18,
    color: colors.ink,
  },
  liveSlotHours: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.muted,
    marginTop: 2,
  },
  liveSeatsText: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.success,
    marginTop: 8,
  },
  liveSeatsMuted: {
    color: colors.muted,
  },
  preBookCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.55)',
    overflow: 'hidden',
    gap: 8,
  },
  preBookCtaCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  preBookCtaText: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    lineHeight: 18,
    color: colors.pink,
  },
  preBookCtaSub: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.muted,
  },
  liveWeekFallback: {
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.55)',
    padding: 14,
    overflow: 'hidden',
  },
  liveWeekLabel: {
    fontFamily: fonts.extraBold,
    fontSize: 13,
    letterSpacing: 1,
    color: colors.ink,
  },
  liveWeekHint: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
  },
  });
}
