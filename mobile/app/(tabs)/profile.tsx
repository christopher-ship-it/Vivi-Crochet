import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ApiClientError } from '../../src/api/client';
import { listMyLiveBookings, type LiveBooking } from '../../src/api/live';
import { getMyProfile, type SavedShippingAddress } from '../../src/api/me';
import { useLearningCustomer, useShoppingSession } from '../../src/auth/SessionContext';
import { useTabDockClearance } from '../../src/components/PremiumTabBar';
import { colors, fonts, spacing } from '../../src/theme';
import { applyStatusBar } from '../../src/utils/statusBar';

function formatLiveRange(start: string, end: string): string {
  const s = new Date(`${start}T12:00:00`);
  const e = new Date(`${end}T12:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return `${start} – ${end}`;
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  return `${s.toLocaleDateString('en-GB', opts)} – ${e.toLocaleDateString('en-GB', opts)}`;
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, isAuthenticated, signOut } = useShoppingSession();
  const { profile: learningProfile } = useLearningCustomer();
  const dockClearance = useTabDockClearance();

  const [address, setAddress] = useState<SavedShippingAddress | null>(null);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [liveBookings, setLiveBookings] = useState<LiveBooking[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  const displayName =
    (isAuthenticated ? user?.name : null)?.trim() ||
    learningProfile?.fullName?.trim() ||
    'VIVI member';
  const displayPhone =
    (isAuthenticated ? user?.phone : null)?.replace(/\D/g, '') ||
    learningProfile?.phone?.replace(/\D/g, '') ||
    null;
  const displayEmail = learningProfile?.email?.trim() || null;

  useFocusEffect(
    useCallback(() => {
      applyStatusBar('dark');

      if (!isAuthenticated) {
        setAddress(null);
        setAddressError(null);
        setAddressLoading(false);
        setLiveBookings([]);
        setLiveError(null);
        setLiveLoading(false);
        return;
      }

      let cancelled = false;
      (async () => {
        setAddressLoading(true);
        setLiveLoading(true);
        setAddressError(null);
        setLiveError(null);
        try {
          const [profile, bookings] = await Promise.all([
            getMyProfile(),
            listMyLiveBookings().catch((err: unknown) => {
              if (!cancelled) {
                setLiveError(
                  err instanceof ApiClientError
                    ? err.message
                    : 'Could not load live bookings.',
                );
              }
              return [] as LiveBooking[];
            }),
          ]);
          if (!cancelled) {
            setAddress(profile.shippingAddress ?? null);
            setLiveBookings(bookings);
          }
        } catch (err) {
          if (!cancelled) {
            setAddressError(err instanceof ApiClientError ? err.message : 'Could not load address.');
          }
        } finally {
          if (!cancelled) {
            setAddressLoading(false);
            setLiveLoading(false);
          }
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [isAuthenticated]),
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: dockClearance + 24 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.card}>
        <Text style={styles.eyebrow}>ACCOUNT</Text>
        {isAuthenticated || learningProfile ? (
          <>
            <Text style={styles.name}>{displayName}</Text>
            {displayPhone ? <Text style={styles.phone}>+91 {displayPhone}</Text> : null}
            {displayEmail ? <Text style={styles.meta}>{displayEmail}</Text> : null}
            {!isAuthenticated && (
              <Pressable style={styles.signInBtn} onPress={() => router.push('/login')}>
                <Text style={styles.signInText}>Sign in for shopping</Text>
              </Pressable>
            )}
          </>
        ) : (
          <>
            <Text style={styles.name}>Welcome</Text>
            <Text style={styles.guestHint}>
              Browse the shop and learn catalogue without signing in. Sign in at checkout when you place
              an order.
            </Text>
            <Pressable style={styles.signInBtn} onPress={() => router.push('/login')}>
              <Text style={styles.signInText}>Sign in</Text>
            </Pressable>
          </>
        )}
      </View>

      {isAuthenticated && (
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.eyebrow}>SAVED ADDRESS</Text>
            <Pressable
              onPress={() => router.push('/edit-address')}
              hitSlop={8}
              accessibilityRole="button"
            >
              <Text style={styles.editLink}>{address ? 'Edit' : 'Add'}</Text>
            </Pressable>
          </View>

          {addressLoading ? (
            <View style={styles.addressLoading}>
              <ActivityIndicator color={colors.pink} />
            </View>
          ) : addressError ? (
            <Text style={styles.addressError}>{addressError}</Text>
          ) : address ? (
            <View style={styles.addressBlock}>
              <Text style={styles.addressName}>{address.fullName}</Text>
              <Text style={styles.addressLine}>+91 {address.phoneNumber}</Text>
              <Text style={styles.addressLine}>{address.addressLine1}</Text>
              {address.addressLine2 ? (
                <Text style={styles.addressLine}>{address.addressLine2}</Text>
              ) : null}
              {address.landmark ? <Text style={styles.addressLine}>{address.landmark}</Text> : null}
              <Text style={styles.addressLine}>
                {address.city}, {address.state} {address.pinCode}
              </Text>
              <Text style={styles.addressLine}>{address.country || 'India'}</Text>
            </View>
          ) : (
            <>
              <Text style={styles.emptyAddress}>
                No saved delivery address yet. Add one so checkout is faster next time.
              </Text>
              <Pressable style={styles.addBtn} onPress={() => router.push('/edit-address')}>
                <Text style={styles.addBtnText}>Add address</Text>
              </Pressable>
            </>
          )}
        </View>
      )}

      {isAuthenticated && (
        <View style={styles.card}>
          <Text style={styles.eyebrow}>LIVE BOOKING</Text>
          {liveLoading ? (
            <View style={styles.addressLoading}>
              <ActivityIndicator color={colors.pink} />
            </View>
          ) : liveError ? (
            <Text style={styles.addressError}>{liveError}</Text>
          ) : liveBookings.length === 0 ? (
            <Text style={styles.emptyAddress}>
              No confirmed live studio bookings yet. Book a Morning or Evening Crochet Circle from Live.
            </Text>
          ) : (
            liveBookings.map((booking) => (
              <Pressable
                key={booking.id}
                style={styles.liveBlock}
                onPress={() =>
                  router.push({
                    pathname: '/live-booking-confirmation',
                    params: { bookingId: booking.id },
                  })
                }
              >
                <Text style={styles.addressName}>{booking.slotName}</Text>
                <Text style={styles.addressLine}>Week {booking.weekNumber}</Text>
                <Text style={styles.addressLine}>
                  {formatLiveRange(booking.startDate, booking.endDate)}
                </Text>
                <Text style={styles.liveStatus}>Status: {booking.status.toUpperCase()}</Text>
              </Pressable>
            ))
          )}
        </View>
      )}

      {isAuthenticated && (
        <Pressable style={styles.logoutBtn} onPress={signOut}>
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  content: {
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.softBorder,
    borderRadius: 18,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  eyebrow: {
    fontFamily: fonts.extraBold,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.pink,
  },
  editLink: {
    fontFamily: fonts.extraBold,
    fontSize: 13,
    color: colors.pink,
  },
  name: {
    fontFamily: fonts.extraBold,
    fontSize: 24,
    color: colors.ink,
    marginTop: 8,
    letterSpacing: -0.3,
  },
  phone: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: colors.ink,
    marginTop: 6,
  },
  meta: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    marginTop: 4,
  },
  guestHint: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 19,
    marginTop: 8,
  },
  signInBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.pink,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  signInText: {
    fontFamily: fonts.extraBold,
    color: colors.white,
    fontSize: 14,
  },
  addressLoading: {
    marginTop: spacing.md,
    alignItems: 'flex-start',
  },
  addressError: {
    marginTop: spacing.md,
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.danger,
  },
  addressBlock: {
    marginTop: spacing.md,
    gap: 4,
  },
  liveBlock: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.softBorder,
    gap: 4,
  },
  liveStatus: {
    fontFamily: fonts.extraBold,
    fontSize: 12,
    letterSpacing: 0.8,
    color: colors.pink,
    marginTop: 4,
  },
  addressName: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: colors.ink,
    marginBottom: 2,
  },
  addressLine: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 20,
  },
  emptyAddress: {
    marginTop: spacing.md,
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 19,
  },
  addBtn: {
    marginTop: spacing.md,
    alignSelf: 'flex-start',
    backgroundColor: colors.pink,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  addBtnText: {
    fontFamily: fonts.extraBold,
    fontSize: 13,
    color: colors.white,
  },
  logoutBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.pinkDark,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  logoutText: {
    fontFamily: fonts.extraBold,
    color: colors.white,
    fontSize: 14,
  },
});
