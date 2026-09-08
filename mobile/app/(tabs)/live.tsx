import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
import { colors, fonts, spacing } from '../../src/theme';
import { formatInr } from '../../src/utils/format';
import { applyStatusBar } from '../../src/utils/statusBar';

function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    .toUpperCase();
}

function formatDayNumber(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return String(d.getDate());
}

function classScheduleLabel(days: LiveDay[]): string {
  const hasReplacement = days.some((d) => d.kind === 'Replacement');
  return hasReplacement ? 'Mon – Fri + Saturday replacement' : 'Mon – Fri';
}

function slotAvailabilityLabel(slot: LiveSlotAvailability): string {
  if (slot.status === 'FullyBooked' || slot.seatsRemaining <= 0) return 'FULLY BOOKED';
  return `${slot.seatsRemaining} SPOTS LEFT`;
}

function dayKindStyle(kind: string) {
  switch (kind) {
    case 'Class':
      return { dot: colors.pink, text: colors.ink };
    case 'Replacement':
      return { dot: colors.pinkDark, text: colors.ink };
    case 'Break':
      return { dot: colors.muted, text: colors.muted };
    case 'Off':
      return { dot: 'transparent', text: colors.muted };
    default:
      return { dot: colors.softBorder, text: colors.muted };
  }
}

export default function LiveScreen() {
  const router = useRouter();
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
        prefillName: user?.name ?? undefined,
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

  if (loading && !refreshing) {
    return <LoadingView message="Loading live weeks…" />;
  }

  if (error && weeks.length === 0) {
    return (
      <ErrorView
        title="Unable to load live availability."
        message={error}
        onAction={() => loadWeeks()}
        actionLabel="Retry"
      />
    );
  }

  if (weeks.length === 0) {
    return (
      <EmptyView
        title="No upcoming live weeks"
        message="Live Crochet Studio availability will appear here when the season opens."
      />
    );
  }

  return (
    <View style={styles.root}>
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
          <Text style={styles.eyebrow}>LIVE CROCHET STUDIO</Text>
          <Text style={styles.subtitle}>Crochet with Vivi, live</Text>
          {packagePrice != null ? (
            <Text style={styles.price}>{formatInr(packagePrice)}/package</Text>
          ) : null}
          <Text style={styles.sundayNote}>Sunday is always OFF · never a class or replacement day</Text>
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
            <View style={styles.weekHeader}>
              <Text style={styles.weekTitle}>WEEK {detail.weekNumber}</Text>
              <Text style={styles.weekRange}>
                {formatShortDate(detail.startDate)} — {formatShortDate(detail.endDate)}
              </Text>
              <Text style={styles.scheduleHint}>{classScheduleLabel(detail.days)}</Text>
            </View>

            <View style={styles.calendarRow}>
              {detail.days.map((day) => {
                const look = dayKindStyle(day.kind);
                return (
                  <View key={day.date} style={styles.dayCell}>
                    <Text style={styles.dayWeekday}>{day.weekday}</Text>
                    <Text style={[styles.dayNumber, { color: look.text }]}>
                      {formatDayNumber(day.date)}
                    </Text>
                    <View
                      style={[
                        styles.dayDot,
                        {
                          backgroundColor: day.kind === 'Off' ? 'transparent' : look.dot,
                          borderWidth: day.kind === 'Off' ? 1.5 : 0,
                          borderColor: colors.softBorder,
                        },
                      ]}
                    />
                    <Text style={[styles.dayLabel, { color: look.text }]} numberOfLines={1}>
                      {day.label}
                    </Text>
                  </View>
                );
              })}
            </View>

            <Text style={styles.sectionLabel}>SELECT CIRCLE</Text>
            {detail.slots.map((slot) => {
              const type = slot.slotType as LiveSlotType;
              const fully =
                slot.status === 'FullyBooked' || slot.seatsRemaining <= 0;
              const selected = selectedSlot === type;
              return (
                <Pressable
                  key={slot.slotType}
                  disabled={fully}
                  style={[
                    styles.slotCard,
                    selected && styles.slotCardSelected,
                    fully && styles.slotCardDisabled,
                  ]}
                  onPress={() => setSelectedSlot(type)}
                >
                  <View style={styles.slotTextCol}>
                    <Text style={styles.slotName}>{slot.name}</Text>
                    <Text style={[styles.slotSpots, fully && styles.slotSpotsFull]}>
                      {slotAvailabilityLabel(slot)}
                    </Text>
                  </View>
                  <Text style={[styles.slotAction, fully && styles.slotActionDisabled]}>
                    {fully ? 'Fully Booked' : selected ? 'Selected' : 'Select'}
                  </Text>
                </Pressable>
              );
            })}

            <Pressable
              style={[styles.bookBtn, !canBook && styles.bookBtnDisabled]}
              disabled={!canBook}
              onPress={() => void startBooking()}
            >
              <Text style={styles.bookBtnText}>
                {selectedSlotData &&
                (selectedSlotData.status === 'FullyBooked' ||
                  selectedSlotData.seatsRemaining <= 0)
                  ? 'FULLY BOOKED'
                  : bookingBusy
                    ? 'PLEASE WAIT…'
                    : 'BOOK THIS SLOT'}
              </Text>
            </Pressable>
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
    backgroundColor: colors.white,
  },
  scroll: {
    flex: 1,
  },
  hero: {
    backgroundColor: colors.pinkSoft,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  eyebrow: {
    fontFamily: fonts.extraBold,
    fontSize: 12,
    letterSpacing: 2.4,
    color: colors.pink,
  },
  subtitle: {
    fontFamily: fonts.extraBold,
    fontSize: 28,
    color: colors.ink,
    marginTop: 10,
    letterSpacing: -0.6,
  },
  price: {
    fontFamily: fonts.semiBold,
    fontSize: 16,
    color: colors.pinkDark,
    marginTop: 12,
  },
  sundayNote: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    marginTop: 10,
    lineHeight: 18,
  },
  sectionLabel: {
    fontFamily: fonts.extraBold,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.pink,
    marginTop: spacing.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  weekRail: {
    paddingHorizontal: spacing.lg,
    gap: 8,
  },
  weekChip: {
    borderWidth: 2,
    borderColor: colors.softBorder,
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minWidth: 118,
    borderRadius: 14,
  },
  weekChipActive: {
    backgroundColor: colors.pink,
    borderColor: colors.pink,
  },
  weekChipTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 12,
    letterSpacing: 1.2,
    color: colors.ink,
  },
  weekChipTitleActive: {
    color: colors.white,
  },
  weekChipDates: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
    marginTop: 4,
  },
  weekChipDatesActive: {
    color: 'rgba(255,255,255,0.85)',
  },
  weekHeader: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.lg,
  },
  weekTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 22,
    color: colors.ink,
    letterSpacing: -0.4,
  },
  weekRange: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.muted,
    marginTop: 4,
  },
  scheduleHint: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    marginTop: 6,
  },
  calendarRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.softBorder,
    backgroundColor: colors.white,
    borderRadius: 14,
    overflow: 'hidden',
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderRightWidth: 1,
    borderRightColor: colors.softBorder,
  },
  dayWeekday: {
    fontFamily: fonts.extraBold,
    fontSize: 9,
    letterSpacing: 0.6,
    color: colors.muted,
  },
  dayNumber: {
    fontFamily: fonts.extraBold,
    fontSize: 16,
    marginTop: 4,
  },
  dayDot: {
    width: 8,
    height: 8,
    marginTop: 6,
    borderRadius: 0,
  },
  dayLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 8,
    letterSpacing: 0.4,
    marginTop: 6,
    textAlign: 'center',
  },
  slotCard: {
    marginHorizontal: spacing.lg,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.softBorder,
    backgroundColor: colors.white,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
  },
  slotCardSelected: {
    backgroundColor: colors.pinkSoft,
    borderColor: colors.pink,
  },
  slotCardDisabled: {
    opacity: 0.55,
  },
  slotTextCol: {
    flex: 1,
    paddingRight: 12,
  },
  slotName: {
    fontFamily: fonts.extraBold,
    fontSize: 16,
    color: colors.ink,
  },
  slotSpots: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    letterSpacing: 1,
    color: colors.pink,
    marginTop: 6,
  },
  slotSpotsFull: {
    color: colors.danger,
  },
  slotAction: {
    fontFamily: fonts.extraBold,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.ink,
    textTransform: 'uppercase',
  },
  slotActionDisabled: {
    color: colors.muted,
  },
  bookBtn: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.pink,
    borderWidth: 0,
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 14,
  },
  bookBtnDisabled: {
    backgroundColor: colors.muted,
    borderColor: colors.muted,
  },
  bookBtnText: {
    fontFamily: fonts.extraBold,
    fontSize: 14,
    letterSpacing: 1.4,
    color: colors.white,
  },
  detailLoading: {
    minHeight: 180,
  },
});
