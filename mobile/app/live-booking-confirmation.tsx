import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getLiveBooking, type LiveBooking } from '../src/api/live';
import { ApiClientError } from '../src/api/client';
import { ErrorView, LoadingView } from '../src/components/StateViews';
import { HeroGradient } from '../src/components/HeroGradient';
import { useI18n } from '../src/i18n';
import { uiFonts, type UiFonts } from '../src/i18n/uiFonts';
import { colors, spacing } from '../src/theme';
import { formatInr } from '../src/utils/format';

function formatRange(start: string, end: string): string {
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return `${start} – ${end}`;
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  return `${s.toLocaleDateString('en-GB', opts)} – ${e.toLocaleDateString('en-GB', opts)}`;
}

function slotTimeCopy(slotType: string): string {
  if (slotType === 'Morning') return '10:00 AM – 12:00 PM';
  if (slotType === 'Evening') return '6:00 PM – 8:00 PM';
  return '';
}

export default function LiveBookingConfirmationScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { t, language } = useI18n();
  const fonts = uiFonts(language);
  const styles = useMemo(() => createStyles(fonts), [language]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [booking, setBooking] = useState<LiveBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!bookingId) return;
    setLoading(true);
    setError(null);
    try {
      setBooking(await getLiveBooking(bookingId));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('liveBookingConfirmation.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [bookingId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingView message={t('liveBookingConfirmation.loading')} />;
  if (error || !booking) {
    return <ErrorView message={error ?? t('liveBookingConfirmation.notFound')} onRetry={load} />;
  }

  const time = slotTimeCopy(booking.slotType);

  return (
    <>
      <Stack.Screen options={{ title: '', headerShadowVisible: false }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <HeroGradient style={styles.hero}>
          <Text style={styles.check}>✓</Text>
          <View style={styles.heroCopy}>
            <Text style={styles.title}>{t('liveBookingConfirmation.title')}</Text>
            <Text style={styles.slot}>{booking.slotName}</Text>
          </View>
        </HeroGradient>

        <View style={styles.panel}>
          <Row
            label={t('liveBookingConfirmation.week')}
            value={t('live.week', { number: booking.weekNumber })}
            styles={styles}
          />
          <Row
            label={t('liveBookingConfirmation.dates')}
            value={formatRange(booking.startDate, booking.endDate)}
            styles={styles}
          />
          {time ? <Row label={t('liveBookingConfirmation.time')} value={time} styles={styles} /> : null}
          <Row
            label={t('liveBookingConfirmation.schedule')}
            value={t('liveBookingConfirmation.scheduleValue')}
            styles={styles}
          />
          <Row
            label={t('liveBookingConfirmation.price')}
            value={formatInr(booking.packagePrice)}
            styles={styles}
          />
          <Row
            label={t('liveBookingConfirmation.reference')}
            value={booking.orderNumber}
            last
            styles={styles}
          />
        </View>

        <Text style={styles.note}>{t('liveBookingConfirmation.note')}</Text>

        <Pressable style={styles.primary} onPress={() => router.replace('/(tabs)/live')}>
          <Text style={styles.primaryText}>{t('liveBookingConfirmation.backToLive')}</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => router.replace('/(tabs)/profile')}>
          <Text style={styles.secondaryText}>{t('liveBookingConfirmation.myVivi')}</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

function Row({
  label,
  value,
  last,
  styles,
}: {
  label: string;
  value: string;
  last?: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function createStyles(fonts: UiFonts) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.canvas,
    },
    content: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
    },
    hero: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: spacing.md,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    check: {
      fontFamily: fonts.extraBold,
      fontSize: 22,
      color: colors.pink,
    },
    heroCopy: {
      flex: 1,
    },
    title: {
      fontFamily: fonts.extraBold,
      fontSize: 20,
      color: colors.ink,
    },
    slot: {
      fontFamily: fonts.regular,
      fontSize: 13,
      color: colors.muted,
      marginTop: 2,
    },
    panel: {
      backgroundColor: colors.white,
      borderWidth: 1,
      borderColor: colors.softBorder,
      borderRadius: 16,
      paddingHorizontal: 14,
      marginBottom: spacing.sm,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
      paddingVertical: 10,
    },
    rowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.softBorder,
    },
    rowLabel: {
      fontFamily: fonts.regular,
      fontSize: 13,
      color: colors.muted,
    },
    rowValue: {
      fontFamily: fonts.semiBold,
      fontSize: 13,
      color: colors.ink,
      textAlign: 'right',
      flex: 1,
    },
    note: {
      fontFamily: fonts.regular,
      fontSize: 12,
      lineHeight: 17,
      color: colors.muted,
      textAlign: 'center',
      marginBottom: spacing.md,
      paddingHorizontal: spacing.sm,
    },
    primary: {
      backgroundColor: colors.pink,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    primaryText: {
      fontFamily: fonts.extraBold,
      fontSize: 15,
      color: colors.white,
    },
    secondary: {
      marginTop: spacing.sm,
      paddingVertical: 12,
      alignItems: 'center',
    },
    secondaryText: {
      fontFamily: fonts.semiBold,
      fontSize: 14,
      color: colors.muted,
    },
  });
}
