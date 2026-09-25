import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
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
  formatLiveClassWeekRange,
  getLiveWeek,
  listLiveWeeks,
  listMyLiveBookings,
  type LiveBooking,
  type LiveSlotAvailability,
  type LiveSlotType,
  type LiveWeekDetail,
  type LiveWeekSummary,
} from '../../src/api/live';
import { getMyProfile } from '../../src/api/me';
import { verifyRazorpayPayment } from '../../src/api/payments';
import { ApiClientError } from '../../src/api/client';
import { useLearningCustomer, useShoppingSession } from '../../src/auth/SessionContext';
import { EmailVerifySheet } from '../../src/components/EmailVerifySheet';
import {
  RazorpayCheckoutModal,
  type RazorpayCheckoutPayload,
  type RazorpaySuccessPayload,
} from '../../src/components/RazorpayCheckoutModal';
import { EmptyView, ErrorView, LoadingView } from '../../src/components/StateViews';
import { AppImage } from '../../src/components/AppImage';
import { useTabDockClearance } from '../../src/components/PremiumTabBar';
import { useI18n } from '../../src/i18n';
import { uiFonts, type UiFonts } from '../../src/i18n/uiFonts';
import { colors, radii, spacing } from '../../src/theme';
import { formatInr } from '../../src/utils/format';
import { applyStatusBar } from '../../src/utils/statusBar';
import {
  isUsableCustomerEmail,
  realCustomerName,
  sanitizeEmail,
} from '../../src/utils/validation';

const LIVE_HERO_GRADIENT = ['#ff8eb0', '#ffb3c9', '#ffd0e0'] as const;
const TUTOR_PLACEHOLDER_GRADIENT = ['#ffb3c9', '#ff8eb0', '#f06a96'] as const;

const SLOT_FALLBACK: Record<LiveSlotType, { label: string; hours: string }> = {
  Morning: { label: 'MORNING', hours: '10:00 AM – 12:00 PM' },
  Evening: { label: 'EVENING', hours: '6:00 PM – 8:00 PM' },
};

/** Split "10:00 AM – 12:00 PM" into large start + small end for the editorial clock. */
function splitHours(hours: string): { start: string; end: string } {
  const parts = hours.split(/–|—|-/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return { start: hours, end: '' };

  const toClock = (raw: string) => {
    const m = raw.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!m) return raw;
    let h = Number(m[1]);
    const min = m[2];
    const ap = (m[3] ?? '').toUpperCase();
    if (ap === 'PM' && h < 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}.${min}`;
  };

  return { start: toClock(parts[0]), end: toClock(parts[1]) };
}

function slotUnavailable(slot: LiveSlotAvailability): boolean {
  return (
    slot.isBlocked === true ||
    slot.status === 'Blocked' ||
    slot.status === 'FullyBooked' ||
    slot.seatsRemaining <= 0
  );
}

function hoursPerClassDay(detail: LiveWeekDetail | null): number {
  return detail?.hoursPerClassDay ?? 2;
}

function SeatDots({
  booked,
  capacity,
  a11yLabel,
  styles,
  selected = false,
}: {
  booked: number;
  capacity: number;
  a11yLabel: string;
  styles: ReturnType<typeof createStyles>;
  selected?: boolean;
}) {
  const total = Math.max(1, Math.min(capacity || 4, 8));
  const filled = Math.max(0, Math.min(booked, total));
  return (
    <View style={styles.seatDots} accessibilityLabel={a11yLabel}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[
            styles.seatDot,
            i < filled
              ? selected
                ? styles.seatDotFilledOnPink
                : styles.seatDotFilled
              : selected
                ? styles.seatDotEmptyOnPink
                : styles.seatDotEmpty,
          ]}
        />
      ))}
    </View>
  );
}

export default function LiveScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dockClearance = useTabDockClearance();
  const { t, language } = useI18n();
  const fonts = uiFonts(language);
  const styles = useMemo(() => createStyles(fonts), [language]);
  const { isAuthenticated, user } = useShoppingSession();
  const { profile: learningProfile, saveProfile } = useLearningCustomer();
  const params = useLocalSearchParams<{ weekId?: string; slot?: string }>();
  const preferredWeekId = typeof params.weekId === 'string' ? params.weekId : undefined;
  const preferredSlot: LiveSlotType | null =
    params.slot === 'Evening' ? 'Evening' : params.slot === 'Morning' ? 'Morning' : null;
  const preferredSlotRef = useRef(preferredSlot);
  preferredSlotRef.current = preferredSlot;

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
  const [emailSheetVisible, setEmailSheetVisible] = useState(false);
  const [emailSheetAutoSend, setEmailSheetAutoSend] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [emailDraft, setEmailDraft] = useState('');
  const [myLiveBookings, setMyLiveBookings] = useState<LiveBooking[]>([]);

  const loadMyBooking = useCallback(async () => {
    if (!isAuthenticated) {
      setMyLiveBookings([]);
      return;
    }
    try {
      const bookings = await listMyLiveBookings();
      setMyLiveBookings(bookings);
    } catch {
      setMyLiveBookings([]);
    }
  }, [isAuthenticated]);

  const loadWeeks = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await listLiveWeeks();
      setWeeks(data);
      setSelectedWeekId((prev) => {
        if (preferredWeekId && data.some((w) => w.id === preferredWeekId)) {
          return preferredWeekId;
        }
        if (prev && data.some((w) => w.id === prev)) return prev;
        return data.find((w) => w.isBookable)?.id ?? data[0]?.id ?? null;
      });
      await loadMyBooking();
    } catch (err) {
      setWeeks([]);
      setDetail(null);
      setError(
        err instanceof ApiClientError
          ? err.message
          : t('live.couldNotLoadLive'),
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadMyBooking, preferredWeekId, t]);

  useFocusEffect(
    useCallback(() => {
      applyStatusBar('dark');
      void loadWeeks();
      return () => applyStatusBar('dark');
    }, [loadWeeks]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!isAuthenticated) {
        setVerifiedEmail('');
        setEmailDraft(sanitizeEmail(learningProfile?.email ?? ''));
        return;
      }

      let cancelled = false;
      void (async () => {
        try {
          const profile = await getMyProfile();
          if (cancelled) return;
          const profileEmail = sanitizeEmail(profile.email);
          const usable = isUsableCustomerEmail(profileEmail);
          setEmailDraft(usable ? profileEmail : sanitizeEmail(learningProfile?.email ?? ''));
          setVerifiedEmail(
            usable && profile.isEmailVerified ? profileEmail : '',
          );
          if (usable && profile.isEmailVerified) {
            await saveProfile({
              fullName: realCustomerName(profile.fullName, learningProfile?.fullName, user?.name),
              phone: profile.phoneNumber || learningProfile?.phone || user?.phone || '',
              email: profileEmail,
            });
          }
        } catch {
          if (!cancelled) {
            setEmailDraft(sanitizeEmail(learningProfile?.email ?? ''));
          }
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [
      isAuthenticated,
      learningProfile?.email,
      learningProfile?.fullName,
      learningProfile?.phone,
      saveProfile,
      user?.name,
      user?.phone,
    ]),
  );

  const loadDetail = useCallback(async (weekId: string) => {
    setDetailLoading(true);
    setError(null);
    try {
      const data = await getLiveWeek(weekId);
      setDetail(data);
      setSelectedSlot((prev: LiveSlotType | null) => {
        const preferred = preferredSlotRef.current;
        if (
          preferred &&
          data.slots.some((s) => s.slotType === preferred && !slotUnavailable(s))
        ) {
          return preferred;
        }
        const stillOk =
          prev &&
          data.slots.some((s) => s.slotType === prev && !slotUnavailable(s));
        if (stillOk) return prev;
        const firstOpen = data.slots.find((s) => !slotUnavailable(s));
        return (firstOpen?.slotType as LiveSlotType | undefined) ?? null;
      });
    } catch (err) {
      setDetail(null);
      setError(
        err instanceof ApiClientError
          ? err.message
          : t('live.couldNotLoadLive'),
      );
    } finally {
      setDetailLoading(false);
    }
  }, [t]);

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

  const tutorName = useMemo(() => {
    const fromDetail = detail?.tutorName?.trim();
    if (fromDetail) return fromDetail;
    const fromWeek = weeks.find((w) => w.id === selectedWeekId)?.tutorName?.trim();
    return fromWeek || 'SRI';
  }, [detail?.tutorName, weeks, selectedWeekId]);

  const tutorPhotoUrl = useMemo(() => {
    const fromDetail = detail?.tutorPhotoUrl?.trim();
    if (fromDetail) return fromDetail;
    return weeks.find((w) => w.id === selectedWeekId)?.tutorPhotoUrl?.trim() || null;
  }, [detail?.tutorPhotoUrl, weeks, selectedWeekId]);

  const packagePrice = detail?.packagePrice ?? weeks[0]?.packagePrice;
  const classHours = hoursPerClassDay(detail);
  const bookingForSelectedWeek = useMemo(() => {
    if (!detail) return null;
    const start = String(detail.startDate).slice(0, 10);
    return (
      myLiveBookings.find((b) => String(b.startDate).slice(0, 10) === start) ?? null
    );
  }, [detail, myLiveBookings]);
  const bookedRange = useMemo(
    () =>
      bookingForSelectedWeek
        ? formatLiveClassWeekRange(bookingForSelectedWeek.startDate)
        : '',
    [bookingForSelectedWeek],
  );
  const canBook =
    !!detail &&
    !!selectedSlotData &&
    detail.isBookable &&
    !slotUnavailable(selectedSlotData) &&
    !bookingBusy &&
    !bookingForSelectedWeek;

  function openEmailSheet(autoSend = false) {
    setEmailSheetAutoSend(autoSend);
    setEmailSheetVisible(true);
  }

  function hasVerifiedEmail(candidate?: string): boolean {
    const email = sanitizeEmail(candidate || verifiedEmail);
    return isUsableCustomerEmail(email);
  }

  async function startBooking(verifiedOverride?: string) {
    if (!detail || !selectedSlot || !canBook) return;

    if (!isAuthenticated) {
      router.push({
        pathname: '/login',
        params: { returnTo: '/(tabs)/live' },
      });
      return;
    }

    const readyEmail = sanitizeEmail(verifiedOverride || verifiedEmail);
    if (!hasVerifiedEmail(readyEmail)) {
      openEmailSheet(isUsableCustomerEmail(emailDraft));
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
        prefillName: realCustomerName(user?.name, learningProfile?.fullName) || undefined,
        prefillEmail: readyEmail,
        prefillContact: learningProfile?.phone || user?.phone || undefined,
      });
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'EMAIL_VERIFICATION_REQUIRED') {
        openEmailSheet(isUsableCustomerEmail(emailDraft || readyEmail));
        return;
      }
      const message =
        err instanceof ApiClientError
          ? err.code === 'ALREADY_BOOKED'
            ? t('live.alreadyBooked')
            : err.message
          : t('live.couldNotStartBooking');
      Alert.alert(t('live.booking'), message);
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
      await loadMyBooking();
      if (selectedWeekId) void loadDetail(selectedWeekId);
    } catch (err) {
      Alert.alert(
        t('live.payment'),
        err instanceof ApiClientError ? err.message : t('live.paymentVerifyFailed'),
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

  function onChooseCircle() {
    if (bookingForSelectedWeek) {
      router.push({
        pathname: '/live-booking-confirmation',
        params: { bookingId: bookingForSelectedWeek.id },
      });
      return;
    }
    if (!selectedSlotData || slotUnavailable(selectedSlotData)) {
      Alert.alert(t('live.chooseCircle'), t('live.chooseCircleBody'));
      return;
    }
    void startBooking();
  }

  if (loading && !refreshing) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <LoadingView message={t('live.loadingWeeks')} />
      </View>
    );
  }

  if (error && weeks.length === 0) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <ErrorView
          title={t('live.loadFailedTitle')}
          message={error}
          onAction={() => loadWeeks()}
          actionLabel={t('common.retry')}
        />
      </View>
    );
  }

  if (weeks.length === 0) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <EmptyView
          title={t('live.noWeeksTitle')}
          message={t('live.noWeeksMessage')}
        />
      </View>
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
        {/* Editorial hero */}
        <LinearGradient
          colors={[...LIVE_HERO_GRADIENT]}
          locations={[0, 0.55, 1]}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + 6 }]}
        >
          <View style={styles.heroBrandRow}>
            <Text style={styles.heroBrand}>Vivi</Text>
            <Text style={styles.heroBrandSub}>{t('live.brandSub')}</Text>
          </View>

          <Text style={styles.heroTitle}>
            {t('live.crochetWithVivi')},{' '}
            <Text style={styles.heroTitleLive}>{t('live.heroLive')}</Text>
          </Text>

          <View style={styles.heroRule} />

          {packagePrice != null ? (
            <View style={styles.heroPriceRow}>
              <Text style={styles.heroPrice}>{formatInr(packagePrice)}</Text>
              <View style={styles.heroPricePill}>
                <Text style={styles.heroPriceMeta}>{t('live.perPackage')}</Text>
              </View>
            </View>
          ) : null}
        </LinearGradient>

        {/* What's included — compact 2x2 grid so it doesn't push the week selector down. */}
        <View style={styles.includedCard}>
          <Text style={styles.includedTitle}>{t('live.includedTitle')}</Text>
          <View style={styles.includedGrid}>
            <View style={styles.includedItem}>
              <Ionicons name="people-outline" size={13} color={colors.pink} />
              <Text style={styles.includedText}>
                {t('live.includedGroup')}
              </Text>
            </View>
            <View style={styles.includedItem}>
              <Ionicons name="school-outline" size={13} color={colors.pink} />
              <Text style={styles.includedText}>
                {t('live.includedBasic')}
              </Text>
            </View>
            <View style={styles.includedItem}>
              <Ionicons name="calendar-outline" size={13} color={colors.pink} />
              <Text style={styles.includedText}>
                {t('live.includedSchedule', {
                  hours:
                    classHours === 1
                      ? t('live.oneHourDaily').toLowerCase()
                      : classHours === 2
                        ? t('live.twoHoursDaily').toLowerCase()
                        : t('live.hoursDaily', { count: classHours }).toLowerCase(),
                })}
              </Text>
            </View>
            <View style={styles.includedItem}>
              <Ionicons name="refresh-outline" size={13} color={colors.pink} />
              <Text style={styles.includedText}>
                {t('live.includedReplacement')}
              </Text>
            </View>
          </View>
        </View>

        {/* Tutor — copy left, portrait right */}
        <View style={styles.studioWrap}>
          <View style={styles.tutorRow}>
            <View style={styles.studioFrame}>
              <View style={styles.studioOval}>
              {tutorPhotoUrl ? (
                <AppImage
                  uri={tutorPhotoUrl}
                  style={styles.studioImage}
                  contentFit="cover"
                  accessibilityLabel={t('live.tutorPhotoA11y', { name: tutorName })}
                  priority="high"
                />
              ) : (
                <LinearGradient
                  colors={[...TUTOR_PLACEHOLDER_GRADIENT]}
                  start={{ x: 0.1, y: 0 }}
                  end={{ x: 0.9, y: 1 }}
                  style={styles.tutorPlaceholder}
                >
                  <Text style={styles.tutorPlaceholderMark}>{tutorName}</Text>
                  <Text style={styles.tutorPlaceholderHint}>{t('live.tutorPlaceholderHint')}</Text>
                </LinearGradient>
              )}
              </View>
            </View>
            <View style={styles.tutorCopy}>
              <Text style={styles.tutorBadgeLabel}>{t('live.yourTutor')}</Text>
              <Text style={styles.tutorBadgeName}>{tutorName}</Text>
              <Text style={styles.tutorCopyHint}>{t('live.tutorLead')}</Text>
            </View>
          </View>
        </View>

        {/* Week selector */}
        <Text style={styles.sectionLabel}>{t('live.selectWeek')}</Text>
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
                style={[styles.weekChipOuter, active && styles.weekChipOuterActive]}
                onPress={() => setSelectedWeekId(week.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                {active ? (
                  <View style={styles.weekChipActiveFill}>
                    <Text style={styles.weekChipTitleActive}>
                      {t('live.week', { number: week.weekNumber }).toUpperCase()}
                    </Text>
                    <Text style={styles.weekChipDatesActive}>
                      {formatLiveClassWeekRange(week.startDate)}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.weekChip}>
                    <Text style={styles.weekChipTitle}>
                      {t('live.week', { number: week.weekNumber }).toUpperCase()}
                    </Text>
                    <Text style={styles.weekChipDates}>
                      {formatLiveClassWeekRange(week.startDate)}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>

        {bookingForSelectedWeek ? (
          <Pressable
            style={({ pressed }) => [styles.bookedBanner, pressed && styles.bookedBannerPressed]}
            onPress={() =>
              router.push({
                pathname: '/live-booking-confirmation',
                params: { bookingId: bookingForSelectedWeek.id },
              })
            }
            accessibilityRole="button"
            accessibilityLabel={t('live.bookedBannerTitle', { range: bookedRange })}
          >
            <View style={styles.bookedBannerCopy}>
              <Text style={styles.bookedBannerEyebrow}>
                {t('live.bookedBannerEyebrow').toUpperCase()}
              </Text>
              <Text style={styles.bookedBannerTitle} numberOfLines={2}>
                {t('live.bookedBannerTitle', { range: bookedRange })}
              </Text>
              <Text style={styles.bookedBannerReady} numberOfLines={1}>
                {t('live.bookedBannerReadyThisWeek', {
                  circle: bookingForSelectedWeek.slotName || bookingForSelectedWeek.slotType,
                })}
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color={colors.pinkDark} />
          </Pressable>
        ) : null}

        {detailLoading && !detail ? (
          <View style={styles.detailLoading}>
            <LoadingView message={t('live.loadingWeekDetail')} />
          </View>
        ) : detail ? (
          <>
            {/* Morning | evening circle cards */}
            <View style={styles.circlesRow}>
              {detail.slots.map((slot) => {
                const type = slot.slotType as LiveSlotType;
                const fallback = SLOT_FALLBACK[type] ?? {
                  label: String(slot.slotType).toUpperCase(),
                  hours: '',
                };
                const hours = slot.hours || fallback.hours;
                const clock = splitHours(hours);
                const unavailable = slotUnavailable(slot);
                const selected = selectedSlot === type;
                const capacity = slot.seatCapacity || 4;
                const booked = unavailable && slot.status === 'FullyBooked'
                  ? capacity
                  : slot.seatsBooked;
                const isEvening = type === 'Evening';
                const isBlocked = unavailable && (slot.isBlocked || slot.status === 'Blocked');

                return (
                  <Pressable
                    key={slot.slotType}
                    style={[
                      styles.circleCard,
                      selected && styles.circleCardSelected,
                      unavailable && styles.circleCardDisabled,
                    ]}
                    disabled={unavailable || bookingBusy}
                    onPress={() => {
                      if (!unavailable) setSelectedSlot(type);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected, disabled: unavailable }}
                  >
                    <View style={styles.circleCardTop}>
                      <View style={[styles.circleTag, isEvening && styles.circleTagEvening]}>
                        <Ionicons
                          name={isEvening ? 'moon-outline' : 'sunny-outline'}
                          size={11}
                          color={isEvening ? colors.white : colors.pinkDark}
                        />
                        <Text style={[styles.circleTagText, isEvening && styles.circleTagTextEvening]}>
                          {fallback.label}
                        </Text>
                      </View>
                      {selected && !unavailable ? (
                        <View style={styles.circleCheck} accessibilityLabel={t('live.selected')}>
                          <Ionicons name="checkmark" size={13} color={colors.white} />
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.circleTimeRow}>
                      <Text style={styles.circleTimeStart}>{clock.start}</Text>
                      {clock.end ? (
                        <Text style={styles.circleTimeEnd}> — {clock.end}</Text>
                      ) : null}
                    </View>
                    <Text style={styles.circleMeta}>{t('live.monFri')}</Text>
                    <Text style={styles.circleMeta}>
                      {classHours === 1
                        ? t('live.oneHourDaily')
                        : classHours === 2
                          ? t('live.twoHoursDaily')
                          : t('live.hoursDaily', { count: classHours })}
                    </Text>

                    <SeatDots
                      booked={booked}
                      capacity={capacity}
                      styles={styles}
                      selected={selected}
                      a11yLabel={t('live.seatsTakenA11y', { filled: booked, total: capacity })}
                    />
                    {unavailable ? (
                      <View style={styles.circleFullChip}>
                        <Text style={styles.circleFullChipText}>
                          {isBlocked ? t('live.blocked') : t('live.fullyBookedCaps')}
                        </Text>
                      </View>
                    ) : (
                      <Text style={[styles.circleSeats, selected && styles.circleSeatsSelected]}>
                        {t('live.seatsOf', { booked, capacity })}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              style={[
                styles.chooseCta,
                bookingForSelectedWeek ? styles.chooseCtaBooked : null,
                (!canBook && !bookingForSelectedWeek) || bookingBusy
                  ? styles.chooseCtaDisabled
                  : null,
              ]}
              disabled={(!canBook && !bookingForSelectedWeek) || bookingBusy}
              onPress={onChooseCircle}
            >
              <Text
                style={[
                  styles.chooseCtaText,
                  bookingForSelectedWeek ? styles.chooseCtaTextBooked : null,
                ]}
              >
                {bookingBusy
                  ? t('live.pleaseWait')
                  : bookingForSelectedWeek
                    ? t('live.viewYourBooking')
                    : t('live.chooseYourCircle')}
              </Text>
              {!bookingBusy ? (
                <View
                  style={[
                    styles.chooseCtaArrow,
                    bookingForSelectedWeek ? styles.chooseCtaArrowBooked : null,
                  ]}
                >
                  <Ionicons
                    name="arrow-forward"
                    size={18}
                    color={bookingForSelectedWeek ? colors.white : colors.pink}
                  />
                </View>
              ) : null}
            </Pressable>

            <Text style={styles.cancelNote}>
              {bookingForSelectedWeek ? t('live.bookedNote') : t('live.bookingsFinal')}
            </Text>
          </>
        ) : error ? (
          <ErrorView
            title={t('live.loadFailedTitle')}
            message={error}
            onAction={() => (selectedWeekId ? loadDetail(selectedWeekId) : loadWeeks())}
            actionLabel={t('common.retry')}
          />
        ) : null}
      </ScrollView>

      <EmailVerifySheet
        visible={emailSheetVisible}
        title={t('live.verifyEmailBookTitle')}
        body={t('live.verifyEmailBookBody')}
        initialEmail={emailDraft}
        autoSendCode={emailSheetAutoSend}
        onVerified={(email) => {
          setVerifiedEmail(email);
          setEmailDraft(email);
          setEmailSheetVisible(false);
          setEmailSheetAutoSend(false);
          void startBooking(email);
        }}
        onDismiss={() => {
          setEmailSheetVisible(false);
          setEmailSheetAutoSend(false);
        }}
      />

      <RazorpayCheckoutModal
        visible={!!checkout}
        payload={checkout}
        onSuccess={(r) => void onPaymentSuccess(r)}
        onDismiss={onPaymentDismiss}
        onError={(message) => {
          Alert.alert(t('live.payment'), message);
          onPaymentDismiss();
        }}
      />
    </View>
  );
}

function createStyles(fonts: UiFonts) {
  return StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  scroll: {
    flex: 1,
  },

  /* Hero — brand gradient, rounded base so the tutor card can float over it. */
  hero: {
    paddingHorizontal: spacing.md + 4,
    paddingBottom: 44,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  heroBrandRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: spacing.md,
  },
  heroBrand: {
    fontFamily: fonts.heading,
    fontSize: 22,
    lineHeight: 26,
    color: colors.ink,
  },
  heroBrandSub: {
    fontFamily: fonts.semiBold,
    fontSize: 9,
    letterSpacing: 1.4,
    color: colors.pinkDark,
  },
  heroTitle: {
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 33,
    color: colors.ink,
  },
  heroTitleLive: {
    fontFamily: fonts.heading,
    fontSize: 32,
    lineHeight: 36,
    color: colors.pinkDark,
  },
  heroRule: {
    width: 36,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.pinkDark,
    opacity: 0.5,
    marginTop: spacing.sm + 2,
    marginBottom: spacing.sm + 2,
  },
  heroPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  heroPrice: {
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 32,
    color: colors.ink,
  },
  heroPricePill: {
    backgroundColor: 'rgba(255, 240, 245, 0.85)',
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  heroPriceMeta: {
    fontFamily: fonts.semiBold,
    fontSize: 9,
    letterSpacing: 0.9,
    color: colors.pinkDark,
  },

  /* What's included — floats over the hero's rounded base, sets the ₹price expectation.
     Kept compact (2x2 grid) so the week selector below isn't pushed off-screen. */
  includedCard: {
    marginHorizontal: spacing.md,
    marginTop: -28,
    marginBottom: spacing.sm + 2,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.pinkMist,
    shadowColor: colors.pinkDark,
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  includedTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 9,
    letterSpacing: 1,
    color: colors.muted,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  includedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  includedItem: {
    width: '50%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
    paddingRight: 4,
    marginBottom: 4,
  },
  includedText: {
    flex: 1,
    fontFamily: fonts.semiBold,
    fontSize: 11,
    lineHeight: 14,
    color: colors.ink,
  },

  /* Tutor — white card floating over the hero, oval portrait. */
  studioWrap: {
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    marginBottom: spacing.sm + 2,
    padding: 10,
    backgroundColor: colors.white,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.pinkMist,
    shadowColor: colors.pinkDark,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  tutorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  tutorCopy: {
    flex: 1,
    justifyContent: 'center',
  },
  tutorCopyHint: {
    marginTop: 4,
    fontFamily: fonts.regular,
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.muted,
  },
  studioFrame: {
    width: 108,
    height: 132,
    padding: 3,
    borderRadius: 54,
    borderWidth: 2,
    borderColor: colors.pink,
    flexShrink: 0,
  },
  studioOval: {
    flex: 1,
    borderRadius: 51,
    overflow: 'hidden',
    backgroundColor: colors.mediaWash,
  },
  studioImage: {
    width: '100%',
    height: '100%',
  },
  tutorPlaceholder: {
    flex: 1,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xs,
  },
  tutorPlaceholderMark: {
    fontFamily: fonts.extraBold,
    fontSize: 19,
    letterSpacing: 1.5,
    color: colors.white,
  },
  tutorPlaceholderHint: {
    marginTop: 3,
    fontFamily: fonts.semiBold,
    fontSize: 8,
    letterSpacing: 0.5,
    color: colors.white,
    opacity: 0.9,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  tutorBadgeLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.pink,
    textTransform: 'uppercase',
  },
  tutorBadgeName: {
    marginTop: 2,
    fontFamily: fonts.extraBold,
    fontSize: 22,
    lineHeight: 26,
    color: colors.ink,
  },

  /* Section label + week chips */
  sectionLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    letterSpacing: 1.4,
    color: colors.pinkDark,
    paddingHorizontal: spacing.md,
    marginBottom: 8,
  },
  weekRail: {
    paddingHorizontal: spacing.md,
    gap: 8,
    paddingBottom: spacing.md,
  },
  weekChipOuter: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.pinkMist,
    backgroundColor: colors.white,
    minWidth: 124,
  },
  weekChipOuterActive: {
    borderColor: colors.pink,
    backgroundColor: colors.pink,
    shadowColor: colors.pink,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  weekChip: {
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 124,
  },
  weekChipActiveFill: {
    backgroundColor: colors.pink,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 124,
  },
  weekChipTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 12,
    color: colors.ink,
  },
  weekChipTitleActive: {
    fontFamily: fonts.extraBold,
    fontSize: 12,
    color: colors.white,
  },
  weekChipDates: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  weekChipDatesActive: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.pinkMist,
    marginTop: 2,
  },

  /* Booked banner */
  bookedBanner: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.pink,
    backgroundColor: colors.pinkSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bookedBannerPressed: {
    opacity: 0.85,
  },
  bookedBannerCopy: {
    flex: 1,
    gap: 2,
  },
  bookedBannerEyebrow: {
    fontFamily: fonts.extraBold,
    fontSize: 9,
    letterSpacing: 1.4,
    color: colors.pinkDark,
  },
  bookedBannerTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 16,
    lineHeight: 20,
    color: colors.ink,
  },
  bookedBannerReady: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    lineHeight: 16,
    color: colors.muted,
    marginTop: 2,
  },
  detailLoading: {
    minHeight: 120,
  },

  /* Morning | evening circle cards */
  circlesRow: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  circleCard: {
    flex: 1,
    padding: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.pinkMist,
    backgroundColor: colors.white,
    shadowColor: colors.pinkDark,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  circleCardSelected: {
    borderWidth: 2,
    borderColor: colors.pink,
    padding: 11,
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 5,
  },
  circleCardDisabled: {
    opacity: 0.62,
    shadowOpacity: 0,
    elevation: 0,
  },
  circleCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    minHeight: 22,
  },
  circleTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.pinkMist,
    backgroundColor: colors.pinkSoft,
  },
  circleTagEvening: {
    borderColor: colors.pink,
    backgroundColor: colors.pink,
  },
  circleTagText: {
    fontFamily: fonts.extraBold,
    fontSize: 9,
    letterSpacing: 0.9,
    color: colors.pinkDark,
  },
  circleTagTextEvening: {
    color: colors.white,
  },
  circleCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleTimeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
  },
  circleTimeStart: {
    fontFamily: fonts.display,
    fontSize: 26,
    lineHeight: 30,
    color: colors.ink,
  },
  circleTimeEnd: {
    fontFamily: fonts.display,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  circleMeta: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
    lineHeight: 15,
    color: colors.muted,
  },
  seatDots: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 12,
    marginBottom: 8,
  },
  seatDot: {
    flex: 1,
    height: 5,
    borderRadius: 3,
  },
  seatDotFilled: {
    backgroundColor: colors.pinkDark,
  },
  seatDotEmpty: {
    backgroundColor: colors.pinkMist,
  },
  seatDotFilledOnPink: {
    backgroundColor: colors.pink,
  },
  seatDotEmptyOnPink: {
    backgroundColor: colors.pinkMist,
  },
  circleSeats: {
    fontFamily: fonts.semiBold,
    fontSize: 9,
    letterSpacing: 0.8,
    color: colors.muted,
  },
  circleSeatsSelected: {
    color: colors.pinkDark,
  },
  circleFullChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.pinkDark,
  },
  circleFullChipText: {
    fontFamily: fonts.extraBold,
    fontSize: 8.5,
    letterSpacing: 0.8,
    color: colors.white,
  },

  /* CTA — pill with arrow in a white circle */
  chooseCta: {
    marginHorizontal: spacing.md,
    backgroundColor: colors.pink,
    borderRadius: radii.pill,
    paddingVertical: 6,
    paddingLeft: 24,
    paddingRight: 6,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    shadowColor: colors.pink,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  chooseCtaDisabled: {
    opacity: 0.45,
    shadowOpacity: 0,
    elevation: 0,
  },
  chooseCtaBooked: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.pink,
    shadowOpacity: 0.12,
  },
  chooseCtaText: {
    flex: 1,
    fontFamily: fonts.extraBold,
    fontSize: 13,
    letterSpacing: 1.2,
    color: colors.white,
  },
  chooseCtaTextBooked: {
    color: colors.pinkDark,
  },
  chooseCtaArrow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chooseCtaArrowBooked: {
    backgroundColor: colors.pink,
  },
  cancelNote: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  });
}
