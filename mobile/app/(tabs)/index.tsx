import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
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
  listLiveWeeks,
  type LiveSlotAvailability,
  type LiveWeekSummary,
} from '../../src/api/live';
import { ApiClientError } from '../../src/api/client';
import { BrandWordmark } from '../../src/components/BrandWordmark';
import { CourseCard, COURSE_RAIL_WIDTH } from '../../src/components/CourseCard';
import { ProductAutoScrollRail } from '../../src/components/ProductAutoScrollRail';
import { LoadingView, ErrorView, EmptyView } from '../../src/components/StateViews';
import { useTabDockClearance } from '../../src/components/PremiumTabBar';
import type { Course, Product } from '../../src/types';
import { colors, fonts, radii, spacing } from '../../src/theme';
import { applyStatusBar } from '../../src/utils/statusBar';

/** Display times aligned with Live tab UI copy when API hours are absent. */
const SLOT_FALLBACK_HOURS: Record<string, string> = {
  Morning: '11:00 AM – 1:00 PM',
  Evening: '6:00 PM – 8:00 PM',
};

function SectionHeader({
  number,
  eyebrow,
  title,
  linkLabel,
  onLinkPress,
}: {
  number: string;
  eyebrow: string;
  title: string;
  linkLabel: string;
  onLinkPress: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionNum}>{number}</Text>
      <View style={styles.sectionHeaderCopy}>
        <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
        <Text style={styles.sectionTitle} numberOfLines={1}>
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
      </Pressable>
    </View>
  );
}

function seatsLabel(slot: LiveSlotAvailability): string {
  if (slot.status === 'FullyBooked' || slot.seatsRemaining <= 0) return 'Fully booked';
  if (slot.seatsRemaining === 1) return '1 seat available';
  return `${slot.seatsRemaining} seats available`;
}

function slotHours(slot: LiveSlotAvailability): string {
  if (slot.hours?.trim()) return slot.hours.trim();
  return SLOT_FALLBACK_HOURS[slot.slotType] ?? '';
}

function LiveSlotPreviewCard({ slot }: { slot: LiveSlotAvailability }) {
  const isMorning = slot.slotType === 'Morning';
  const hours = slotHours(slot);
  const available = slot.status !== 'FullyBooked' && slot.seatsRemaining > 0;
  const label =
    slot.slotType === 'Morning' || slot.slotType === 'Evening'
      ? slot.slotType
      : slot.name || slot.slotType;

  return (
    <View style={styles.liveSlotCard}>
      <View style={styles.liveSlotTop}>
        <Ionicons
          name={isMorning ? 'sunny-outline' : 'moon-outline'}
          size={16}
          color={colors.pink}
        />
        <Text style={styles.liveSlotLabel}>{label}</Text>
      </View>
      <Text style={styles.liveSlotName}>Crochet Circle</Text>
      {hours ? (
        <Text style={styles.liveSlotHours} numberOfLines={1}>
          {hours}
        </Text>
      ) : null}
      <Text style={[styles.liveSeatsText, !available && styles.liveSeatsMuted]} numberOfLines={1}>
        {seatsLabel(slot)}
      </Text>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
  const [productRailActive, setProductRailActive] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setProductRailActive(true);
      applyStatusBar('dark');
      return () => {
        setProductRailActive(false);
        applyStatusBar('dark');
      };
    }, []),
  );

  const loadProducts = useCallback(async () => {
    setProductsLoading(true);
    setProductsError(null);
    try {
      const data = await listProducts();
      setProducts(data);
    } catch (err) {
      setProductsError(err instanceof ApiClientError ? err.message : 'Failed to load products.');
    } finally {
      setProductsLoading(false);
    }
  }, []);

  const loadCourses = useCallback(async () => {
    setCoursesLoading(true);
    setCoursesError(null);
    try {
      const data = await listCourses();
      setCourses(data.slice(0, 4));
    } catch (err) {
      setCoursesError(err instanceof ApiClientError ? err.message : 'Failed to load courses.');
    } finally {
      setCoursesLoading(false);
    }
  }, []);

  // Reuses the same live-weeks endpoint already powering the Live tab —
  // just a compact preview of the current/next bookable week here.
  const loadLive = useCallback(async () => {
    setLiveLoading(true);
    setLiveError(null);
    try {
      const data = await listLiveWeeks();
      setLiveWeek(data.find((w) => w.isBookable) ?? data[0] ?? null);
    } catch (err) {
      setLiveError(err instanceof ApiClientError ? err.message : 'Failed to load live weeks.');
    } finally {
      setLiveLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
    void loadCourses();
    void loadLive();
  }, [loadProducts, loadCourses, loadLive]);

  const liveSlots = useMemo(() => {
    if (!liveWeek?.slots?.length) return [];
    const morning = liveWeek.slots.find((s) => s.slotType === 'Morning');
    const evening = liveWeek.slots.find((s) => s.slotType === 'Evening');
    return [morning, evening].filter(Boolean) as LiveSlotAvailability[];
  }, [liveWeek]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <BrandWordmark size="sm" />
        <Pressable
          style={styles.iconBtn}
          onPress={() => router.push('/(tabs)/profile')}
          accessibilityRole="button"
          accessibilityLabel="My VIVI settings"
          hitSlop={8}
        >
          <Ionicons name="settings-outline" size={20} color={colors.ink} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: dockClearance + 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          {/* Hero image intentionally removed — copy-only header. */}
          <Text style={styles.heroEyebrow}>HANDMADE WITH LOVE</Text>
          <Text style={styles.heroTitle}>
            Every loop is a <Text style={styles.heroAccent}>choice.</Text>
          </Text>
          <Text style={styles.heroScript}>Stitch by stitch</Text>
          <Text style={styles.heroLinks}>
            <Text onPress={() => router.push('/(tabs)/learn')} style={styles.heroLink}>
              Learn
            </Text>
            {' · '}
            <Text onPress={() => router.push('/(tabs)/shop')} style={styles.heroLink}>
              Shop
            </Text>
            {' · '}
            <Text onPress={() => router.push('/(tabs)/live')} style={styles.heroLink}>
              Live
            </Text>
          </Text>
        </View>

        <View style={styles.section}>
          <SectionHeader
            number="1"
            eyebrow="LEARN & LOOP"
            title="Crochet Academy"
            linkLabel="VIEW ALL →"
            onLinkPress={() => router.push('/(tabs)/learn')}
          />

          {coursesLoading && (
            <View style={styles.inlineState}>
              <LoadingView message="Loading courses…" />
            </View>
          )}
          {!coursesLoading && coursesError && (
            <View style={styles.inlineState}>
              <ErrorView message={coursesError} onRetry={loadCourses} />
            </View>
          )}
          {!coursesLoading && !coursesError && courses.length === 0 && (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>Published courses will appear here.</Text>
            </View>
          )}
          {!coursesLoading && !coursesError && courses.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              nestedScrollEnabled
              contentContainerStyle={styles.courseRail}
            >
              {courses.map((course, index) => (
                <View
                  key={course.id}
                  style={[styles.courseRailItem, index === courses.length - 1 && styles.railItemLast]}
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
            eyebrow="LIVE CROCHET STUDIO"
            title="Crochet with Vivi, live"
            linkLabel="VIEW LIVE →"
            onLinkPress={() => router.push('/(tabs)/live')}
          />

          {liveLoading && (
            <View style={styles.inlineStateSmall}>
              <LoadingView message="Loading live weeks…" />
            </View>
          )}
          {!liveLoading && liveError && (
            <View style={styles.inlineStateSmall}>
              <ErrorView message={liveError} onRetry={loadLive} />
            </View>
          )}
          {!liveLoading && !liveError && !liveWeek && (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>
                Live weeks will appear here when the season opens.
              </Text>
            </View>
          )}
          {!liveLoading && !liveError && liveWeek && (
            <Pressable
              style={styles.livePreview}
              onPress={() => router.push('/(tabs)/live')}
              accessibilityRole="button"
              accessibilityLabel="Open Live Crochet Studio"
            >
              {liveSlots.length > 0 ? (
                <View style={styles.liveSlotsRow}>
                  {liveSlots.map((slot) => (
                    <View key={slot.slotType} style={styles.liveSlotWrap}>
                      <LiveSlotPreviewCard slot={slot} />
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.liveWeekFallback}>
                  <Text style={styles.liveWeekLabel}>WEEK {liveWeek.weekNumber}</Text>
                  <Text style={styles.liveWeekHint}>
                    {liveWeek.isBookable ? 'Open for booking' : 'View schedule'}
                  </Text>
                </View>
              )}
            </Pressable>
          )}
        </View>

        <View style={styles.section}>
          <SectionHeader
            number="3"
            eyebrow="SHOP HANDMADE"
            title="Beautiful pieces, made by hand."
            linkLabel="SHOP ALL →"
            onLinkPress={() => router.push('/(tabs)/shop')}
          />

          {productsLoading && (
            <View style={styles.shopInlineState}>
              <LoadingView message="Loading products…" />
            </View>
          )}
          {!productsLoading && productsError && (
            <View style={styles.shopInlineState}>
              <ErrorView message={productsError} onRetry={loadProducts} />
            </View>
          )}
          {!productsLoading && !productsError && products.length === 0 && (
            <View style={styles.shopInlineState}>
              <EmptyView
                title="No products yet"
                message="Handmade pieces will appear here when published."
              />
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
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.white,
  },
  scroll: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  heroEyebrow: {
    fontFamily: fonts.semiBold,
    fontSize: 10,
    letterSpacing: 1.6,
    color: colors.pink,
  },
  heroTitle: {
    fontFamily: fonts.heading,
    fontSize: 36,
    lineHeight: 44,
    paddingBottom: 4,
    color: colors.ink,
    marginTop: 6,
  },
  heroAccent: {
    color: colors.pink,
  },
  heroScript: {
    fontFamily: fonts.decorative,
    fontSize: 28,
    lineHeight: 36,
    paddingBottom: 4,
    color: colors.pink,
    marginTop: 2,
  },
  heroLinks: {
    marginTop: 8,
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
  },
  heroLink: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.muted,
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
    fontSize: 17,
    lineHeight: 21,
    letterSpacing: -0.3,
    color: colors.ink,
    marginTop: 2,
  },
  viewAllBtn: {
    paddingTop: 4,
  },
  viewAllText: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.pink,
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
    gap: 8,
  },
  liveSlotsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  liveSlotWrap: {
    flex: 1,
  },
  liveSlotCard: {
    backgroundColor: colors.canvas,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  liveSlotTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  liveSlotLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    letterSpacing: 0.8,
    color: colors.pink,
    textTransform: 'uppercase',
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
    marginTop: 4,
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
  liveWeekFallback: {
    borderRadius: radii.md,
    backgroundColor: colors.canvas,
    padding: 14,
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
