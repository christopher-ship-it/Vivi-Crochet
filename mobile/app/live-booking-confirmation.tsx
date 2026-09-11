import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getLiveBooking, type LiveBooking } from '../src/api/live';
import { ApiClientError } from '../src/api/client';
import { ErrorView, LoadingView } from '../src/components/StateViews';
import { colors, fonts, spacing } from '../src/theme';
import { formatInr } from '../src/utils/format';

function formatRange(start: string, end: string): string {
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return `${start} – ${end}`;
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  return `${s.toLocaleDateString('en-GB', opts)} – ${e.toLocaleDateString('en-GB', opts)}`;
}

function slotTimeCopy(slotType: string): string {
  if (slotType === 'Morning') return '11:00 AM – 1:00 PM';
  if (slotType === 'Evening') return '6:00 PM – 8:00 PM';
  return '';
}

export default function LiveBookingConfirmationScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
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
      setError(err instanceof ApiClientError ? err.message : 'Could not load booking.');
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingView message="Confirming booking…" />;
  if (error || !booking) {
    return <ErrorView message={error ?? 'Booking not found.'} onRetry={load} />;
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
        <View style={styles.hero}>
          <Text style={styles.check}>✓</Text>
          <View style={styles.heroCopy}>
            <Text style={styles.title}>Booking confirmed</Text>
            <Text style={styles.slot}>{booking.slotName}</Text>
          </View>
        </View>

        <View style={styles.panel}>
          <Row label="Week" value={`Week ${booking.weekNumber}`} />
          <Row label="Dates" value={formatRange(booking.startDate, booking.endDate)} />
          {time ? <Row label="Time" value={time} /> : null}
          <Row label="Schedule" value="Mon–Fri · 2 hrs/day" />
          <Row label="Price" value={formatInr(booking.packagePrice)} />
          <Row label="Reference" value={booking.orderNumber} last />
        </View>

        <Text style={styles.note}>
          Sat = replacement if a weekday is missed · Sun OFF · No cancel once confirmed.
        </Text>

        <Pressable style={styles.primary} onPress={() => router.replace('/(tabs)/live')}>
          <Text style={styles.primaryText}>Back to Live</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => router.replace('/(tabs)/profile')}>
          <Text style={styles.secondaryText}>My Vivi</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

function Row({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.pinkSoft,
    borderWidth: 1,
    borderColor: colors.softBorder,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
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
    fontSize: 18,
    color: colors.ink,
    letterSpacing: -0.2,
  },
  slot: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.pink,
    marginTop: 2,
  },
  panel: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.softBorder,
    backgroundColor: colors.white,
    borderRadius: 16,
    overflow: 'hidden',
  },
  row: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.softBorder,
  },
  rowLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.muted,
  },
  rowValue: {
    flex: 1,
    textAlign: 'right',
    fontFamily: fonts.extraBold,
    fontSize: 13,
    color: colors.ink,
  },
  note: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    lineHeight: 18,
    marginTop: spacing.sm,
  },
  primary: {
    marginTop: spacing.md,
    backgroundColor: colors.pink,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: {
    fontFamily: fonts.extraBold,
    fontSize: 14,
    color: colors.white,
  },
  secondary: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.softBorder,
    backgroundColor: colors.white,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryText: {
    fontFamily: fonts.extraBold,
    fontSize: 14,
    color: colors.pink,
  },
});
