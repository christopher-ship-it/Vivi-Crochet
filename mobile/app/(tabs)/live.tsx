import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  Platform,
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

function LiveGlass({
  children,
  style,
  intensity = 26,
}: {
  children: ReactNode;
  style?: object;
  intensity?: number;
}) {
  if (Platform.OS === 'ios') {
    return (
      <BlurView intensity={intensity} tint="light" style={style}>
        {children}
      </BlurView>
    );
  }
  return <View style={[style, stylesLiveGlass.android]}>{children}</View>;
}

const stylesLiveGlass = StyleSheet.create({
  android: {
    backgroundColor: 'rgba(255, 248, 250, 0.78)',
  },
});

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
              <Text style={styles.heroPriceMeta}>{t('live.perPackage')}</Text>
            </View>
          ) : null}
        </LinearGradient>

        {/* Tutor — copy left, portrait right */}
        <View style={styles.studioWrap}>
          <View style={styles.tutorRow}>
            <View style={styles.tutorCopy}>
              <Text style={styles.tutorBadgeLabel}>{t('live.yourTutor')}</Text>
              <Text style={styles.tutorBadgeName}>{tutorName}</Text>
              <Text style={styles.tutorCopyHint}>{t('live.tutorLead')}</Text>
            </View>
            <View style={styles.studioFrame}>
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
                  <LiveGlass style={styles.weekChip} intensity={24}>
                    <Text style={styles.weekChipTitle}>
                      {t('live.week', { number: week.weekNumber }).toUpperCase()}
                    </Text>
                    <Text style={styles.weekChipDates}>
                      {formatLiveClassWeekRange(week.startDate)}
                    </Text>
                  </LiveGlass>
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
            {/* Two-column morning | evening */}
            <View style={styles.circlesPanelOuter}>
              <LiveGlass style={styles.circlesPanel}>
              {detail.slots.map((slot, index) => {
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

                return (
                  <View key={slot.slotType} style={styles.circleColumnWrap}>
                    {index > 0 ? <View style={styles.circleDivider} /> : null}
                    <Pressable
                      style={[
                        styles.circleColumn,
                        selected && styles.circleColumnSelected,
                        unavailable && styles.circleColumnDisabled,
                      ]}
                      disabled={unavailable || bookingBusy}
                      onPress={() => {
                        if (!unavailable) setSelectedSlot(type);
                      }}
                    >
                      <Text style={[styles.circleWeek, selected && styles.circleTextOnPink]}>
                        {t('live.week', { number: detail.weekNumber }).toUpperCase()}
                      </Text>
                      <Text style={[styles.circleDates, selected && styles.circleDatesOnPink]}>
                        {formatLiveClassWeekRange(detail.startDate)}
                      </Text>

                      <Text style={[styles.circleSlotLabel, selected && styles.circleMutedOnPink]}>
                        {fallback.label}
                      </Text>
                      <View style={styles.circleTimeRow}>
                        <Text style={[styles.circleTimeStart, selected && styles.circleTextOnPink]}>
                          {clock.start}
                        </Text>
                        {clock.end ? (
                          <Text style={[styles.circleTimeEnd, selected && styles.circleMutedOnPink]}>
                            {' '}
                            — {clock.end}
                          </Text>
                        ) : null}
                      </View>

                      <Text style={[styles.circleMeta, selected && styles.circleTextOnPink]}>
                        {t('live.monFri')}
                      </Text>
                      <Text style={[styles.circleMeta, selected && styles.circleTextOnPink]}>
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
                      <Text style={[styles.circleSeats, selected && styles.circleMutedOnPink]}>
                        {unavailable && (slot.isBlocked || slot.status === 'Blocked')
                          ? t('live.blocked')
                          : unavailable
                            ? t('live.fullyBookedCaps')
                            : t('live.seatsOf', { booked, capacity }).toUpperCase()}
                      </Text>
                      {selected && !unavailable ? (
                        <Text style={styles.circleSelected}>{t('live.selected')}</Text>
                      ) : null}
                    </Pressable>
                  </View>
                );
              })}
              </LiveGlass>
            </View>

            <Text style={styles.planNote}>{t('live.planNote')}</Text>
            <Text style={styles.replaceNote}>{t('live.replaceNote')}</Text>

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
                <Ionicons
                  name="arrow-forward"
                  size={18}
                  color={bookingForSelectedWeek ? colors.pinkDark : colors.white}
                />
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

  hero: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    alignItems: 'center',
  },
  heroBrandRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    alignSelf: 'flex-start',
    marginBottom: spacing.sm,
  },
  heroBrand: {
    fontFamily: fonts.heading,
    fontSize: 22,
    lineHeight: 26,
    color: colors.ink,
  },
  heroBrandSub: {
    fontFamily: fonts.semiBold,
    fontSize: 8,
    letterSpacing: 1.2,
    color: colors.ink,
    opacity: 0.72,
  },
  heroTitle: {
    fontFamily: fonts.display,
    fontSize: 26,
    lineHeight: 30,
    color: colors.ink,
    textAlign: 'center',
  },
  heroTitleLive: {
    fontFamily: fonts.heading,
    fontSize: 30,
    lineHeight: 34,
    color: colors.pinkDark,
  },
  heroRule: {
    width: 40,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.pinkDark,
    opacity: 0.45,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  heroPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  heroPrice: {
    fontFamily: fonts.display,
    fontSize: 26,
    lineHeight: 30,
    color: colors.ink,
  },
  heroPriceMeta: {
    fontFamily: fonts.semiBold,
    fontSize: 8,
    letterSpacing: 1,
    color: colors.ink,
    opacity: 0.72,
    maxWidth: 110,
  },

  studioWrap: {
    backgroundColor: colors.pinkSoft,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  tutorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  tutorCopy: {
    flex: 1,
    paddingRight: spacing.xs,
    justifyContent: 'center',
  },
  tutorCopyHint: {
    marginTop: 6,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink,
    opacity: 0.72,
  },
  studioFrame: {
    width: 104,
    height: 128,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.mediaWash,
    flexShrink: 0,
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
    padding: spacing.sm,
  },
  tutorPlaceholderMark: {
    fontFamily: fonts.extraBold,
    fontSize: 22,
    letterSpacing: 2,
    color: colors.white,
  },
  tutorPlaceholderHint: {
    marginTop: 4,
    fontFamily: fonts.semiBold,
    fontSize: 8,
    letterSpacing: 0.6,
    color: colors.white,
    opacity: 0.88,
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
    marginTop: 4,
    fontFamily: fonts.extraBold,
    fontSize: 26,
    lineHeight: 30,
    color: colors.ink,
  },

  sectionLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    letterSpacing: 1.6,
    color: colors.pink,
    paddingHorizontal: spacing.md,
    marginTop: 2,
    marginBottom: 6,
  },
  weekRail: {
    paddingHorizontal: spacing.md,
    gap: 8,
    paddingBottom: 6,
  },
  bookedBanner: {
    marginHorizontal: spacing.md,
    marginTop: 2,
    marginBottom: spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.pinkDark,
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
  weekChipOuter: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.55)',
    minWidth: 96,
  },
  weekChipOuterActive: {
    borderColor: colors.pink,
    borderWidth: 2.5,
    backgroundColor: colors.pink,
    shadowColor: colors.pink,
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  weekChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    paddingHorizontal: 12,
    paddingVertical: 9,
    minWidth: 96,
  },
  weekChipActiveFill: {
    backgroundColor: colors.pink,
    paddingHorizontal: 12,
    paddingVertical: 9,
    minWidth: 96,
  },
  weekChipTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 11,
    color: colors.ink,
  },
  weekChipTitleActive: {
    fontFamily: fonts.extraBold,
    fontSize: 11,
    color: colors.white,
  },
  weekChipDates: {
    fontFamily: fonts.regular,
    fontSize: 10,
    color: colors.muted,
    marginTop: 2,
  },
  weekChipDatesActive: {
    fontFamily: fonts.regular,
    fontSize: 10,
    color: 'rgba(255,255,255,0.92)',
    marginTop: 2,
  },
  detailLoading: {
    minHeight: 120,
  },

  circlesPanelOuter: {
    marginHorizontal: spacing.md,
    marginTop: 2,
    marginBottom: spacing.sm,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.55)',
  },
  circlesPanel: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    overflow: 'hidden',
  },
  circleColumnWrap: {
    flex: 1,
    flexDirection: 'row',
  },
  circleDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(234, 223, 227, 0.7)',
  },
  circleColumn: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 12,
    alignItems: 'flex-start',
  },
  circleColumnSelected: {
    backgroundColor: colors.pink,
  },
  circleColumnDisabled: {
    opacity: 0.5,
  },
  circleWeek: {
    fontFamily: fonts.extraBold,
    fontSize: 10,
    letterSpacing: 0.6,
    color: colors.ink,
  },
  circleDates: {
    fontFamily: fonts.display,
    fontSize: 12,
    fontStyle: 'italic',
    color: colors.muted,
    marginTop: 1,
    marginBottom: 8,
  },
  circleSlotLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 9,
    letterSpacing: 1.1,
    color: colors.muted,
    marginBottom: 2,
  },
  circleTimeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  circleTimeStart: {
    fontFamily: fonts.display,
    fontSize: 22,
    lineHeight: 26,
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
    fontSize: 11,
    lineHeight: 14,
    color: colors.ink,
  },
  circleTextOnPink: {
    color: colors.white,
  },
  circleDatesOnPink: {
    color: 'rgba(255,255,255,0.88)',
  },
  circleMutedOnPink: {
    color: 'rgba(255,255,255,0.82)',
  },
  seatDots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 10,
    marginBottom: 6,
  },
  seatDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  seatDotFilled: {
    backgroundColor: colors.pinkDark,
  },
  seatDotEmpty: {
    borderWidth: 1.5,
    borderColor: colors.pinkDark,
    backgroundColor: 'transparent',
  },
  seatDotFilledOnPink: {
    backgroundColor: colors.white,
  },
  seatDotEmptyOnPink: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: 'transparent',
  },
  circleSeats: {
    fontFamily: fonts.semiBold,
    fontSize: 8,
    letterSpacing: 0.9,
    color: colors.muted,
  },
  circleSelected: {
    fontFamily: fonts.semiBold,
    fontSize: 8,
    letterSpacing: 0.8,
    color: colors.white,
    marginTop: 6,
  },

  planNote: {
    fontFamily: fonts.semiBold,
    fontSize: 9,
    letterSpacing: 1.2,
    color: colors.muted,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: 6,
  },
  replaceNote: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.ink,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  chooseCta: {
    marginHorizontal: spacing.md,
    backgroundColor: colors.pink,
    borderRadius: radii.sm,
    paddingVertical: 16,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  chooseCtaDisabled: {
    opacity: 0.45,
  },
  chooseCtaBooked: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.pinkDark,
  },
  chooseCtaText: {
    fontFamily: fonts.extraBold,
    fontSize: 13,
    letterSpacing: 1.4,
    color: colors.white,
  },
  chooseCtaTextBooked: {
    color: colors.pinkDark,
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
