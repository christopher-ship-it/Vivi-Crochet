import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Dimensions,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  createLiveBooking,
  getLiveWeek,
  listLiveWeeks,
  type LiveDay,
  type LiveSlotAvailability,
  type LiveSlotType,
  type LiveWeekDetail,
  type LiveWeekSummary,
} from '../../src/api/live';
import { verifyRazorpayPayment } from '../../src/api/payments';
import { ApiClientError } from '../../src/api/client';
import { useShoppingSession } from '../../src/auth/SessionContext';
import {
  RazorpayCheckoutModal,
  type RazorpayCheckoutPayload,
  type RazorpaySuccessPayload,
} from '../../src/components/RazorpayCheckoutModal';
import { EmptyView, ErrorView, LoadingView } from '../../src/components/StateViews';
import { useTabDockClearance } from '../../src/components/PremiumTabBar';
import { colors, fonts, radii, spacing } from '../../src/theme';
import { formatInr } from '../../src/utils/format';
import { applyStatusBar } from '../../src/utils/statusBar';
import { realCustomerName } from '../../src/utils/validation';

const HERO_YARN = require('../../assets/live-hero-yarn.png');
const SCREEN_WIDTH = Dimensions.get('window').width;
const SIDE_BY_SIDE = SCREEN_WIDTH >= 380;
const HERO_IMAGE_SIZE = Math.min(168, Math.round(SCREEN_WIDTH * 0.42));

/** Display copy — booking still uses API slot hours / seats. */
const SLOT_META: Record<
  LiveSlotType,
  { eyebrow: string; title: string; time: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  Morning: {
    eyebrow: 'MORNING',
    title: 'CROCHET CIRCLE',
    time: '11:00 AM – 1:00 PM',
    icon: 'sunny-outline',
  },
  Evening: {
    eyebrow: 'EVENING',
    title: 'CROCHET CIRCLE',
    time: '6:00 PM – 8:00 PM',
    icon: 'moon-outline',
  },
};

const WEEKDAY_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI'] as const;

function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    .toUpperCase();
}

function slotMeta(slotType: string) {
  if (slotType === 'Morning' || slotType === 'Evening') return SLOT_META[slotType];
  return {
    eyebrow: slotType.toUpperCase(),
    title: 'CROCHET CIRCLE',
    time: '',
    icon: 'ellipse-outline' as keyof typeof Ionicons.glyphMap,
  };
}

function slotAvailabilityLabel(slot: LiveSlotAvailability): string {
  if (slot.status === 'FullyBooked' || slot.seatsRemaining <= 0) return 'FULLY BOOKED';
  if (slot.seatsRemaining === 1) return '1 spot left';
  return `${slot.seatsRemaining} seats available`;
}

function hoursPerClassDay(detail: LiveWeekDetail | null): number {
  return detail?.hoursPerClassDay ?? 2;
}

function weeklyLiveHours(detail: LiveWeekDetail | null): number {
  return detail?.weeklyLiveHours ?? 10;
}

export default function LiveScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dockClearance = useTabDockClearance();
  const { isAuthenticated, user } = useShoppingSession();

  const [weeks, setWeeks] = useState<LiveWeekSummary[]>([]);
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LiveWeekDetail | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<LiveSlotType | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingBusy, setBookingBusy] = useState(false);
  const [checkout, setCheckout] = useState<RazorpayCheckoutPayload | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [pendingBookingId, setPendingBookingId] = useState<string | null>(null);

  const loadWeeks = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await listLiveWeeks();
      setWeeks(data);
      setSelectedWeekId((prev) => {
        if (prev && data.some((w) => w.id === prev)) return prev;
        return data.find((w) => w.isBookable)?.id ?? data[0]?.id ?? null;
      });
    } catch (err) {
      setWeeks([]);
      setDetail(null);
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Unable to load live availability.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      applyStatusBar('dark');
      void loadWeeks();
    }, [loadWeeks]),
  );

  const loadDetail = useCallback(async (weekId: string) => {
    setDetailLoading(true);
    setError(null);
    try {
      const data = await getLiveWeek(weekId);
      setDetail(data);
      setSelectedSlot((prev: LiveSlotType | null) => {
        const stillOk =
          prev &&
          data.slots.some(
            (s) => s.slotType === prev && s.status !== 'FullyBooked' && s.seatsRemaining > 0,
          );
        if (stillOk) return prev;
        const firstOpen = data.slots.find(
          (s) => s.status !== 'FullyBooked' && s.seatsRemaining > 0,
        );
        return (firstOpen?.slotType as LiveSlotType | undefined) ?? null;
      });
    } catch (err) {
      setDetail(null);
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Unable to load live availability.',
      );
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!selectedWeekId) return;
      void loadDetail(selectedWeekId);
    }, [selectedWeekId, loadDetail]),
  );

  const selectedSlotData = useMemo(
    () => detail?.slots.find((s) => s.slotType === selectedSlot) ?? null,
    [detail, selectedSlot],
  );

  const packagePrice = detail?.packagePrice ?? weeks[0]?.packagePrice;
  const classHours = hoursPerClassDay(detail);
  const weekHours = weeklyLiveHours(detail);
  const canBook =
    !!detail &&
    !!selectedSlotData &&
    detail.isBookable &&
    selectedSlotData.status !== 'FullyBooked' &&
    selectedSlotData.seatsRemaining > 0 &&
    !bookingBusy;

  async function startBooking() {
    if (!detail || !selectedSlot || !canBook) return;

    if (!isAuthenticated) {
      router.push({
        pathname: '/login',
        params: { returnTo: '/(tabs)/live' },
      });
      return;
    }

    setBookingBusy(true);
    try {
      const created = await createLiveBooking(detail.id, selectedSlot);
      setPendingOrderId(created.orderId);
      setPendingBookingId(created.bookingId);
      setCheckout({
        keyId: created.razorpayKeyId,
        orderId: created.razorpayOrderId,
        amountPaise: created.amountPaise,
        currency: created.currency,
        name: 'VIVI Crochet',
        description: `${created.slotName} · Week ${created.weekNumber}`,
        prefillName: realCustomerName(user?.name) || undefined,
        prefillContact: user?.phone ?? undefined,
      });
    } catch (err) {
      const message =
        err instanceof ApiClientError
          ? err.code === 'ALREADY_BOOKED'
            ? 'Already booked'
            : err.message
          : 'Could not start booking.';
      Alert.alert('Booking', message);
      if (selectedWeekId) void loadDetail(selectedWeekId);
    } finally {
      setBookingBusy(false);
    }
  }

  async function onPaymentSuccess(result: RazorpaySuccessPayload) {
    if (!pendingOrderId || !pendingBookingId) {
      setCheckout(null);
      return;
    }
    setBookingBusy(true);
    try {
      await verifyRazorpayPayment({
        internalOrderId: pendingOrderId,
        razorpayOrderId: result.razorpay_order_id,
        razorpayPaymentId: result.razorpay_payment_id,
        razorpaySignature: result.razorpay_signature,
      });
      setCheckout(null);
      router.push({
        pathname: '/live-booking-confirmation',
        params: { bookingId: pendingBookingId },
      });
      setPendingOrderId(null);
      setPendingBookingId(null);
      if (selectedWeekId) void loadDetail(selectedWeekId);
    } catch (err) {
      Alert.alert(
        'Payment',
        err instanceof ApiClientError ? err.message : 'Payment verification failed.',
      );
      if (selectedWeekId) void loadDetail(selectedWeekId);
    } finally {
      setBookingBusy(false);
      setCheckout(null);
    }
  }

  function onPaymentDismiss() {
    setCheckout(null);
    setPendingOrderId(null);
    setPendingBookingId(null);
    if (selectedWeekId) void loadDetail(selectedWeekId);
  }

  function onSlotCta(type: LiveSlotType, fully: boolean) {
    if (fully || bookingBusy) return;
    if (selectedSlot !== type) {
      setSelectedSlot(type);
      return;
    }
    void startBooking();
  }

  if (loading && !refreshing) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <LoadingView message="Loading live weeks…" />
      </View>
    );
  }

  if (error && weeks.length === 0) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <ErrorView
          title="Unable to load live availability."
          message={error}
          onAction={() => loadWeeks()}
          actionLabel="Retry"
        />
      </View>
    );
  }

  if (weeks.length === 0) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <EmptyView
          title="No upcoming live weeks"
          message="Live Crochet Studio availability will appear here when the season opens."
        />
      </View>
    );
  }

  const weekdayDays: LiveDay[] | null =
    detail?.days.filter((d) => WEEKDAY_ORDER.includes(d.weekday.toUpperCase() as (typeof WEEKDAY_ORDER)[number])) ??
    null;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: dockClearance + 28 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadWeeks(true)}
            tintColor={colors.pink}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={[styles.heroCopy, { paddingRight: HERO_IMAGE_SIZE + 8 }]}>
            <Text style={styles.eyebrow}>LIVE CROCHET STUDIO</Text>
            <Text style={styles.title}>Crochet with Vivi, live</Text>
            <Text style={styles.subLearn}>Learn together.</Text>
            <Text style={styles.subStitch}>Stitch by stitch.</Text>
            {packagePrice != null ? (
              <Text style={styles.price}>
                {formatInr(packagePrice)}
                <Text style={styles.priceUnit}> / package</Text>
              </Text>
            ) : null}
          </View>
          <View
            style={[
              styles.heroImageWrap,
              { width: HERO_IMAGE_SIZE, height: HERO_IMAGE_SIZE },
            ]}
            pointerEvents="none"
          >
            <Image
              source={HERO_YARN}
              style={styles.heroImage}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
            <View style={styles.heroImageFadeRail} pointerEvents="none">
              {[0.72, 0.5, 0.32, 0.16, 0.06].map((opacity, index) => (
                <View
                  key={opacity}
                  style={[styles.heroImageFadeStrip, { opacity, left: index * 10 }]}
                />
              ))}
            </View>
          </View>
        </View>

        <Text style={styles.sectionLabel}>SELECT WEEK</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.weekRail}
        >
          {weeks.map((week) => {
            const active = week.id === selectedWeekId;
            return (
              <Pressable
                key={week.id}
                style={[styles.weekChip, active && styles.weekChipActive]}
                onPress={() => setSelectedWeekId(week.id)}
              >
                <Text style={[styles.weekChipTitle, active && styles.weekChipTitleActive]}>
                  WEEK {week.weekNumber}
                </Text>
                <Text style={[styles.weekChipDates, active && styles.weekChipDatesActive]}>
                  {formatShortDate(week.startDate)} – {formatShortDate(week.endDate)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {detailLoading && !detail ? (
          <View style={styles.detailLoading}>
            <LoadingView message="Loading week…" />
          </View>
        ) : detail ? (
          <>
            <View style={[styles.slotGrid, !SIDE_BY_SIDE && styles.slotGridStack]}>
              {detail.slots.map((slot) => {
                const type = slot.slotType as LiveSlotType;
                const meta = slotMeta(type);
                const fully =
                  slot.status === 'FullyBooked' || slot.seatsRemaining <= 0;
                const selected = selectedSlot === type;
                const ctaLabel = fully
                  ? 'FULLY BOOKED'
                  : selected
                    ? bookingBusy
                      ? 'PLEASE WAIT…'
                      : `Book ${meta.eyebrow.charAt(0)}${meta.eyebrow.slice(1).toLowerCase()} →`
                    : `Select ${meta.eyebrow.charAt(0)}${meta.eyebrow.slice(1).toLowerCase()} →`;

                return (
                  <Pressable
                    key={slot.slotType}
                    disabled={fully || bookingBusy}
                    style={[
                      styles.slotCard,
                      SIDE_BY_SIDE && styles.slotCardHalf,
                      selected && styles.slotCardSelected,
                      fully && styles.slotCardDisabled,
                    ]}
                    onPress={() => {
                      if (!fully) setSelectedSlot(type);
                    }}
                  >
                    <View style={styles.slotHeader}>
                      <Ionicons name={meta.icon} size={14} color={colors.pink} />
                      <Text style={styles.slotEyebrow}>
                        {meta.eyebrow}{' '}
                        <Text style={styles.slotEyebrowRest}>{meta.title}</Text>
                      </Text>
                    </View>

                    <View style={styles.slotMedia}>
                      <Ionicons
                        name={meta.icon}
                        size={36}
                        color={colors.pink}
                        style={{ opacity: 0.35 }}
                      />
                    </View>

                    <View style={styles.slotBody}>
                      {(slot.hours || meta.time) ? (
                        <View style={styles.slotRow}>
                          <Ionicons name="time-outline" size={14} color={colors.muted} />
                          <Text style={styles.slotTime}>{slot.hours || meta.time}</Text>
                        </View>
                      ) : null}
                      <View style={styles.slotRow}>
                        <Ionicons name="calendar-outline" size={14} color={colors.muted} />
                        <Text style={styles.slotMeta}>
                          Mon – Fri · {classHours} hours each day
                        </Text>
                      </View>
                      <View style={styles.slotRow}>
                        <Ionicons name="people-outline" size={14} color={colors.muted} />
                        <Text
                          style={[
                            styles.slotSeats,
                            fully && styles.slotSeatsFull,
                          ]}
                        >
                          {slotAvailabilityLabel(slot)}
                        </Text>
                      </View>
                      {selected && !fully ? (
                        <Text style={styles.selectedMark}>✓ {meta.eyebrow} SELECTED</Text>
                      ) : null}
                    </View>

                    <Pressable
                      style={[
                        styles.slotCta,
                        selected && !fully && styles.slotCtaSelected,
                        fully && styles.slotCtaDisabled,
                        type === 'Evening' && !selected && !fully && styles.slotCtaGhost,
                      ]}
                      disabled={fully || bookingBusy || (selected && !canBook)}
                      onPress={() => onSlotCta(type, fully)}
                    >
                      <Text
                        style={[
                          styles.slotCtaText,
                          type === 'Evening' && !selected && !fully && styles.slotCtaTextGhost,
                          fully && styles.slotCtaTextDisabled,
                        ]}
                      >
                        {ctaLabel}
                      </Text>
                    </Pressable>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.weekSection}>
              <View style={styles.weekSectionHead}>
                <Text style={styles.sectionLabelInline}>YOUR WEEK</Text>
                <Text style={styles.weekHoursHint}>
                  {weekHours} hours of live crochet per week
                </Text>
              </View>

              <View style={styles.weekdayRow}>
                {(weekdayDays && weekdayDays.length > 0
                  ? weekdayDays
                  : WEEKDAY_ORDER.map((weekday) => ({
                      weekday,
                      kind: 'Class',
                      date: weekday,
                      label: 'Class',
                    }))
                ).map((day) => (
                  <View key={day.date} style={styles.weekdayBlock}>
                    <Text style={styles.weekdayName}>{day.weekday.toUpperCase()}</Text>
                    <Text style={styles.weekdayHours}>{classHours}h</Text>
                  </View>
                ))}
              </View>

              <Text style={styles.weekTotal}>
                {weekHours} HOURS OF LIVE CROCHET / WEEK
              </Text>

              <View style={styles.weekendRow}>
                <View style={styles.weekendCard}>
                  <Ionicons name="calendar-outline" size={18} color={colors.pink} />
                  <Text style={styles.weekendTitle}>SATURDAY Replacement Class</Text>
                  <Text style={styles.weekendBody}>
                    If you miss a weekday class, you can attend on Saturday.
                  </Text>
                </View>
                <View style={styles.weekendCard}>
                  <Ionicons name="cafe-outline" size={18} color={colors.pink} />
                  <Text style={styles.weekendTitle}>SUNDAY Rest Day</Text>
                  <Text style={styles.weekendBody}>
                    No class and no worries. Take time to create!
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.quote}>
              <Text style={styles.quoteMark}>“</Text>
              <Text style={styles.quoteText}>
                Better stitches, brighter days — together. — Vivi
              </Text>
            </View>

            <Text style={styles.cancelNote}>
              Bookings cannot be cancelled once confirmed.
            </Text>
          </>
        ) : error ? (
          <ErrorView
            title="Unable to load live availability."
            message={error}
            onAction={() => (selectedWeekId ? loadDetail(selectedWeekId) : loadWeeks())}
            actionLabel="Retry"
          />
        ) : null}
      </ScrollView>

      <RazorpayCheckoutModal
        visible={!!checkout}
        payload={checkout}
        onSuccess={(r) => void onPaymentSuccess(r)}
        onDismiss={onPaymentDismiss}
        onError={(message) => {
          Alert.alert('Payment', message);
          onPaymentDismiss();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  scroll: {
    flex: 1,
  },
  hero: {
    position: 'relative',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    minHeight: HERO_IMAGE_SIZE + 8,
    overflow: 'hidden',
  },
  heroCopy: {
    zIndex: 1,
  },
  heroImageWrap: {
    position: 'absolute',
    top: 0,
    right: spacing.xl + spacing.sm,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroImageFadeRail: {
    ...StyleSheet.absoluteFillObject,
  },
  heroImageFadeStrip: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 12,
    backgroundColor: colors.canvas,
  },
  eyebrow: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    letterSpacing: 1.6,
    color: colors.pink,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 36,
    lineHeight: 44,
    paddingBottom: 4,
    color: colors.ink,
    marginTop: 8,
  },
  subLearn: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
    marginTop: 6,
  },
  subStitch: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
    marginTop: 0,
  },
  price: {
    fontFamily: fonts.extraBold,
    fontSize: 26,
    color: colors.pink,
    marginTop: 12,
  },
  priceUnit: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.muted,
  },
  sectionLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    letterSpacing: 1.6,
    color: colors.pink,
    paddingHorizontal: spacing.md,
    marginTop: 8,
    marginBottom: 8,
  },
  sectionLabelInline: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    letterSpacing: 1.6,
    color: colors.pink,
  },
  weekRail: {
    paddingHorizontal: spacing.md,
    gap: 8,
    paddingBottom: spacing.lg,
  },
  weekChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 118,
  },
  weekChipActive: {
    backgroundColor: colors.pink,
    borderColor: colors.pink,
  },
  weekChipTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 12,
    color: colors.ink,
  },
  weekChipTitleActive: {
    color: colors.white,
  },
  weekChipDates: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  weekChipDatesActive: {
    color: 'rgba(255,255,255,0.88)',
  },
  detailLoading: {
    minHeight: 160,
  },
  slotGrid: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  slotGridStack: {
    flexDirection: 'column',
  },
  slotCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  slotCardHalf: {
    flexBasis: 0,
    flexGrow: 1,
  },
  slotCardSelected: {
    borderColor: colors.pink,
    borderWidth: 1.5,
  },
  slotCardDisabled: {
    opacity: 0.55,
  },
  slotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.pinkSoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  slotEyebrow: {
    flex: 1,
    fontFamily: fonts.semiBold,
    fontSize: 10,
    letterSpacing: 0.6,
    color: colors.pink,
  },
  slotEyebrowRest: {
    color: colors.ink,
  },
  slotMedia: {
    height: 88,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotBody: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  slotTime: {
    flex: 1,
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.ink,
  },
  slotMeta: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 15,
    color: colors.muted,
  },
  slotSeats: {
    flex: 1,
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.success,
  },
  slotSeatsFull: {
    color: colors.danger,
  },
  selectedMark: {
    fontFamily: fonts.semiBold,
    fontSize: 10,
    letterSpacing: 0.6,
    color: colors.pink,
    marginTop: 2,
  },
  slotCta: {
    marginHorizontal: 12,
    marginBottom: 12,
    marginTop: 4,
    backgroundColor: colors.pink,
    borderRadius: radii.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  slotCtaSelected: {
    backgroundColor: colors.pinkDark,
  },
  slotCtaGhost: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.pink,
  },
  slotCtaDisabled: {
    backgroundColor: colors.softBorder,
    borderWidth: 0,
  },
  slotCtaText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.white,
  },
  slotCtaTextGhost: {
    color: colors.pink,
  },
  slotCtaTextDisabled: {
    color: colors.muted,
  },
  weekSection: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  weekSectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 12,
  },
  weekHoursHint: {
    flexShrink: 1,
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
    textAlign: 'right',
  },
  weekdayRow: {
    flexDirection: 'row',
    gap: 6,
  },
  weekdayBlock: {
    flex: 1,
    backgroundColor: colors.pinkSoft,
    borderRadius: radii.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  weekdayName: {
    fontFamily: fonts.semiBold,
    fontSize: 10,
    letterSpacing: 0.6,
    color: colors.ink,
  },
  weekdayHours: {
    fontFamily: fonts.extraBold,
    fontSize: 14,
    color: colors.ink,
    marginTop: 4,
  },
  weekTotal: {
    marginTop: 12,
    fontFamily: fonts.semiBold,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.muted,
    textAlign: 'center',
  },
  weekendRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  weekendCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 12,
    gap: 6,
  },
  weekendTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.ink,
  },
  weekendBody: {
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 15,
    color: colors.muted,
  },
  quote: {
    marginHorizontal: spacing.md,
    backgroundColor: colors.pinkSoft,
    borderRadius: radii.md,
    paddingHorizontal: 16,
    paddingVertical: 18,
    marginBottom: spacing.md,
  },
  quoteMark: {
    fontFamily: fonts.extraBold,
    fontSize: 36,
    lineHeight: 36,
    color: colors.pink,
    opacity: 0.7,
  },
  quoteText: {
    fontFamily: fonts.regular,
    fontStyle: 'italic',
    fontSize: 14,
    lineHeight: 21,
    color: colors.ink,
    marginTop: 4,
  },
  cancelNote: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
});
