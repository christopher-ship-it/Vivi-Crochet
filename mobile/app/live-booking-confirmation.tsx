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

function scheduleCopy(booking: LiveBooking): string {
  const hasReplacement = booking.days.some((d) => d.kind === 'Replacement');
  return hasReplacement ? 'Mon – Fri + Saturday replacement' : 'Mon – Fri';
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

  return (
    <>
      <Stack.Screen options={{ title: 'Booking confirmed', headerShadowVisible: false }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 36 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={styles.check}>✓</Text>
          <Text style={styles.title}>BOOKING CONFIRMED</Text>
          <Text style={styles.slot}>{booking.slotName}</Text>
        </View>

        <View style={styles.panel}>
          <Row label="Week" value={`Week ${booking.weekNumber}`} />
          <Row label="Dates" value={formatRange(booking.startDate, booking.endDate)} />
          <Row label="Schedule" value={scheduleCopy(booking)} />
          <Row label="Price" value={formatInr(booking.packagePrice)} />
          <Row label="Reference" value={booking.orderNumber} last />
        </View>

        <Text style={styles.note}>
          Sunday is always OFF. Your seat is confirmed after successful payment verification.
        </Text>

        <Pressable style={styles.primary} onPress={() => router.replace('/(tabs)/live')}>
          <Text style={styles.primaryText}>BACK TO LIVE</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => router.replace('/(tabs)/profile')}>
          <Text style={styles.secondaryText}>MY VIVI</Text>
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
    padding: spacing.lg,
  },
  hero: {
    backgroundColor: colors.pinkSoft,
    borderWidth: 1,
    borderColor: colors.softBorder,
    borderRadius: 18,
    padding: spacing.lg,
    alignItems: 'flex-start',
  },
  check: {
    fontFamily: fonts.extraBold,
    fontSize: 28,
    color: colors.pink,
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 22,
    letterSpacing: 1.2,
    color: colors.ink,
    marginTop: 8,
  },
  slot: {
    fontFamily: fonts.semiBold,
    fontSize: 16,
    color: colors.pink,
    marginTop: 10,
  },
  panel: {
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.softBorder,
    backgroundColor: colors.white,
    borderRadius: 18,
    overflow: 'hidden',
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowBorder: {
    borderBottomWidth: 1,
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
    fontSize: 13,
    color: colors.muted,
    lineHeight: 20,
    marginTop: spacing.md,
  },
  primary: {
    marginTop: spacing.xl,
    backgroundColor: colors.pink,
    borderWidth: 0,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryText: {
    fontFamily: fonts.extraBold,
    fontSize: 13,
    letterSpacing: 1.4,
    color: colors.white,
  },
  secondary: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.softBorder,
    backgroundColor: colors.white,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  secondaryText: {
    fontFamily: fonts.extraBold,
    fontSize: 13,
    letterSpacing: 1.4,
    color: colors.pink,
  },
});
