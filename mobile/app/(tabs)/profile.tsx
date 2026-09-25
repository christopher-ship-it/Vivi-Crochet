import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClientError } from '../../src/api/client';
import { listMyEnrollments, type Enrollment } from '../../src/api/enrollments';
import { listMyLiveBookings, type LiveBooking } from '../../src/api/live';
import { getMyProfile, type SavedShippingAddress } from '../../src/api/me';
import { listMyOrders } from '../../src/api/orders';
import { useLearningCustomer, useShoppingSession } from '../../src/auth/SessionContext';
import { useCart } from '../../src/cart/CartContext';
import { LanguageSelector } from '../../src/components/LanguageSelector';
import { LearnerJourney } from '../../src/components/LearnerJourney';
import { useTabDockClearance } from '../../src/components/PremiumTabBar';
import { useI18n, type TranslationKey } from '../../src/i18n';
import { uiFonts, type UiFonts } from '../../src/i18n/uiFonts';
import { colors, myViviHeroGradient, shadows, spacing } from '../../src/theme';
import { buildLearnerJourney } from '../../src/utils/learnerJourney';
import { applyStatusBar } from '../../src/utils/statusBar';
import { realCustomerName, isPlaceholderCustomerName } from '../../src/utils/validation';

const APP_VERSION =
  Constants.expoConfig?.version
  ?? Constants.nativeAppVersion
  ?? '1.0.3';

type FooterLink = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

function openStoreListing(alertTitle: string, alertBody: string) {
  const androidUrl = 'https://play.google.com/store/apps/details?id=in.vivicrochet.app';
  const iosUrl = 'https://apps.apple.com/app/id000000000';
  void Linking.openURL(Platform.OS === 'ios' ? iosUrl : androidUrl).catch(() => {
    Alert.alert(alertTitle, alertBody);
  });
}

function formatLiveRange(start: string, end: string): string {
  const s = new Date(`${start}T12:00:00`);
  const e = new Date(`${end}T12:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return `${start} – ${end}`;
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  return `${s.toLocaleDateString('en-GB', opts)} – ${e.toLocaleDateString('en-GB', opts)}`;
}

function isSyntheticEmail(email: string | null | undefined): boolean {
  return Boolean(email?.trim().toLowerCase().endsWith('@vivicrochet.dev'));
}

function firstNameFrom(fullName: string): string {
  const part = fullName.trim().split(/\s+/)[0];
  return part || 'there';
}

function initialFrom(fullName: string): string {
  const ch = fullName.trim().charAt(0);
  return ch ? ch.toUpperCase() : 'V';
}

type MenuItem = {
  key: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

/** Soft peach → blush wash behind the brand footer, echoing the hero gradient. */
const FOOTER_GRADIENT = ['#fdf1e4', '#fbe1ea', '#f8d6e4'] as const;

/** Visual grouping of the My Vivi menu; every item keeps its own action. */
const MENU_GROUPS: { id: string; labelKey: TranslationKey; keys: string[] }[] = [
  { id: 'shopping', labelKey: 'profile.groupShopping', keys: ['orders', 'buy-again', 'coupons', 'address'] },
  { id: 'live', labelKey: 'profile.groupLive', keys: ['live'] },
  { id: 'preferences', labelKey: 'profile.groupPreferences', keys: ['account'] },
  { id: 'support', labelKey: 'profile.groupSupport', keys: ['help'] },
];

function MenuRow({
  title,
  subtitle,
  icon,
  onPress,
  isLast,
  styles,
}: {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  isLast?: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.menuRow, pressed && styles.pressed, isLast && styles.menuRowLast]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={styles.menuIcon}>
        <Ionicons name={icon} size={17} color={colors.pink} />
      </View>
      <View style={styles.menuCopy}>
        <Text style={styles.menuTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.menuSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#b0a4a8" />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, language } = useI18n();
  const fonts = uiFonts(language);
  const styles = useMemo(() => createStyles(fonts), [language]);
  const { user, isAuthenticated, signOut } = useShoppingSession();
  const { profile: learningProfile, saveProfile: saveLearningProfile } = useLearningCustomer();
  const { itemCount } = useCart();
  const dockClearance = useTabDockClearance();

  const [address, setAddress] = useState<SavedShippingAddress | null>(null);
  const [addressLoading, setAddressLoading] = useState(false);
  const [liveBookings, setLiveBookings] = useState<LiveBooking[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);

  const [profileEmail, setProfileEmail] = useState<string | null>(null);
  const [profilePhone, setProfilePhone] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [buyAgainLoading, setBuyAgainLoading] = useState(false);

  const resolvedName = realCustomerName(
    profileName,
    learningProfile?.fullName,
    isAuthenticated ? user?.name : null,
  );
  const displayName =
    resolvedName || (isAuthenticated ? t('profile.viviFriend') : t('profile.there'));
  const heyName = firstNameFrom(displayName);
  const avatarInitial = initialFrom(isAuthenticated ? displayName : 'Vivi');
  const displayPhone =
    (profilePhone || (isAuthenticated ? user?.phone : null) || learningProfile?.phone || '')
      .replace(/\D/g, '') || null;
  const rawEmail = profileEmail?.trim() || learningProfile?.email?.trim() || null;
  const displayEmail = rawEmail && !isSyntheticEmail(rawEmail) ? rawEmail : null;

  const nextLive = liveBookings[0] ?? null;
  const memberCard = useMemo(() => {
    if (!isAuthenticated) {
      return {
        title: t('profile.joinVivi'),
        subtitle: t('profile.joinSub'),
        onPress: () => router.push('/login'),
      };
    }
    if (nextLive) {
      return {
        title: `${nextLive.slotName} · ${t('live.week', { number: nextLive.weekNumber })}`,
        subtitle: t('profile.liveStudioRange', {
          range: formatLiveRange(nextLive.startDate, nextLive.endDate),
        }),
        onPress: () =>
          router.push({
            pathname: '/live-booking-confirmation',
            params: { bookingId: nextLive.id },
          }),
      };
    }
    return {
      title: t('profile.viviMember'),
      subtitle: t('profile.memberSub'),
      onPress: () => router.push('/(tabs)/live'),
    };
  }, [isAuthenticated, nextLive, router, t]);

  const journey = useMemo(() => buildLearnerJourney(enrollments), [enrollments]);

  const loggedInVia = displayPhone
    ? displayPhone
    : displayEmail
      ? displayEmail
      : isAuthenticated
        ? t('profile.yourAccount')
        : null;

  const requireAuth = useCallback(
    (action: () => void) => {
      if (!isAuthenticated) {
        router.push('/login');
        return;
      }
      action();
    },
    [isAuthenticated, router],
  );

  const openBuyAgain = useCallback(() => {
    requireAuth(() => {
      if (buyAgainLoading) return;
      void (async () => {
        setBuyAgainLoading(true);
        try {
          const orders = await listMyOrders();
          const lastProductId = orders
            .filter((o) => o.status !== 'Cancelled' && o.status !== 'PaymentFailed')
            .flatMap((o) => o.items)
            .find((item) => item.itemType === 'Product' && item.productId)?.productId;

          if (!lastProductId) {
            Alert.alert(t('profile.buyAgain'), t('profile.buyAgainEmpty'), [
              { text: t('profile.browseShop'), onPress: () => router.push('/(tabs)/shop') },
              { text: t('common.ok'), style: 'cancel' },
            ]);
            return;
          }

          router.push(`/product/${lastProductId}`);
        } catch (err) {
          Alert.alert(
            t('profile.buyAgain'),
            err instanceof ApiClientError ? err.message : t('profile.buyAgainFailed'),
          );
        } finally {
          setBuyAgainLoading(false);
        }
      })();
    });
  }, [buyAgainLoading, requireAuth, router, t]);

  const menuItems: MenuItem[] = useMemo(
    () => [
      {
        key: 'orders',
        title: t('profile.orders'),
        subtitle: t('profile.ordersSub'),
        icon: 'cube-outline',
        onPress: () =>
          requireAuth(() =>
            router.push({ pathname: '/(tabs)/shop', params: { shopTab: 'orders' } }),
          ),
      },
      {
        key: 'buy-again',
        title: t('profile.buyAgain'),
        subtitle: buyAgainLoading ? t('profile.buyAgainLoading') : t('profile.buyAgainSub'),
        icon: 'refresh-outline',
        onPress: openBuyAgain,
      },
      {
        key: 'coupons',
        title: t('profile.coupons'),
        subtitle: t('profile.couponsSub'),
        icon: 'pricetag-outline',
        onPress: () => Alert.alert(t('profile.coupons'), t('profile.couponsSoon')),
      },
      {
        key: 'address',
        title: t('profile.address'),
        subtitle: address
          ? `${address.tag ? `${address.tag} · ` : ''}${address.city}, ${address.state}`
          : t('profile.addressSub'),
        icon: 'location-outline',
        onPress: () => requireAuth(() => router.push('/edit-address')),
      },
      {
        key: 'live',
        title: t('profile.liveStudio'),
        subtitle:
          liveBookings.length > 0
            ? liveBookings.length === 1
              ? t('profile.liveBookingsOne')
              : t('profile.liveBookingsMany', { count: liveBookings.length })
            : t('profile.liveBookSub'),
        icon: 'videocam-outline',
        onPress: () => router.push('/(tabs)/live'),
      },
      {
        key: 'help',
        title: t('profile.helpCenter'),
        subtitle: t('profile.helpSub'),
        icon: 'help-circle-outline',
        onPress: () => router.push('/help-center'),
      },
      {
        key: 'account',
        title: t('profile.profileSettings'),
        subtitle: t('profile.profileSettingsSub'),
        icon: 'person-outline',
        onPress: () => requireAuth(() => router.push('/profile-settings')),
      },
    ],
    [address, buyAgainLoading, liveBookings.length, openBuyAgain, requireAuth, router, t],
  );

  useFocusEffect(
    useCallback(() => {
      applyStatusBar('dark');

      if (!isAuthenticated) {
        setAddress(null);
        setAddressLoading(false);
        setLiveBookings([]);
        setLiveLoading(false);
        setEnrollments([]);
        setProfileEmail(null);
        setProfilePhone(null);
        setProfileName(null);
        return;
      }

      let cancelled = false;
      (async () => {
        setAddressLoading(true);
        setLiveLoading(true);
        try {
          const [profile, bookings, mine] = await Promise.all([
            getMyProfile(),
            listMyLiveBookings().catch(() => [] as LiveBooking[]),
            listMyEnrollments().catch(() => [] as Enrollment[]),
          ]);
          if (!cancelled) {
            setAddress(profile.shippingAddress ?? null);
            setProfileEmail(isSyntheticEmail(profile.email) ? null : profile.email ?? null);
            setProfilePhone(profile.phoneNumber ?? null);
            setProfileName(
              isPlaceholderCustomerName(profile.fullName) ? null : profile.fullName ?? null,
            );
            setLiveBookings(bookings);
            setEnrollments(mine);

            const localName = learningProfile?.fullName ?? '';
            const localEmail = learningProfile?.email ?? '';
            if (
              learningProfile &&
              (isPlaceholderCustomerName(localName) || isSyntheticEmail(localEmail))
            ) {
              void saveLearningProfile({
                fullName: isPlaceholderCustomerName(localName)
                  ? realCustomerName(profile.fullName) || ''
                  : localName,
                phone: profile.phoneNumber || learningProfile.phone || '',
                email: isSyntheticEmail(localEmail)
                  ? isSyntheticEmail(profile.email)
                    ? ''
                    : profile.email
                  : localEmail,
              });
            }
          }
        } catch (err) {
          if (!cancelled && err instanceof ApiClientError) {
            // Keep page usable even if profile fetch fails.
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthenticated]),
  );

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: dockClearance + 28 }}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={[...myViviHeroGradient.colors]}
          locations={[...myViviHeroGradient.locations]}
          start={myViviHeroGradient.start}
          end={myViviHeroGradient.end}
          style={[styles.hero, { paddingTop: insets.top + 8 }]}
        >
          <View style={styles.topBar}>
            <Text style={styles.brandMark}>{t('profile.myVivi')}</Text>
            <View style={styles.topActions}>
              <Pressable
                style={styles.iconBtn}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('profile.notifications')}
                onPress={() => Alert.alert(t('profile.notifications'), t('profile.notificationsBody'))}
              >
                <Ionicons name="notifications-outline" size={22} color={colors.ink} />
                <View style={styles.notifDot} />
              </Pressable>
              <Pressable
                style={styles.iconBtn}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('profile.wishlist')}
                onPress={() => router.push('/(tabs)/shop')}
              >
                <Ionicons name="heart-outline" size={22} color={colors.ink} />
              </Pressable>
              <Pressable
                style={styles.iconBtn}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={
                  itemCount > 0 ? t('home.cartItems', { count: itemCount }) : t('home.cart')
                }
                onPress={() => router.push('/cart')}
              >
                <Ionicons name="bag-handle-outline" size={22} color={colors.ink} />
                {itemCount > 0 ? (
                  <View style={styles.cartBadge}>
                    <Text style={styles.cartBadgeText}>{itemCount > 99 ? '99+' : itemCount}</Text>
                  </View>
                ) : null}
              </Pressable>
            </View>
          </View>

          <View style={styles.greetingRow}>
            <View style={styles.greetingCopy}>
              <Text style={styles.heyText}>{t('profile.hey', { name: heyName })}</Text>
              {!isAuthenticated ? (
                <Pressable onPress={() => router.push('/login')} hitSlop={6}>
                  <Text style={styles.signInHint}>{t('profile.signInHint')}</Text>
                </Pressable>
              ) : null}
            </View>
            <Pressable
              style={styles.avatarWrap}
              onPress={() => requireAuth(() => router.push('/edit-account'))}
              accessibilityRole="button"
              accessibilityLabel={t('profile.account')}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarLetter}>{avatarInitial}</Text>
              </View>
              <View style={styles.crownBadge}>
                <Text style={styles.crownGlyph}>♛</Text>
              </View>
            </Pressable>
          </View>

          <View style={styles.heroSpacer} />
        </LinearGradient>

        <View style={styles.sheet}>
          <Pressable
            style={({ pressed }) => [styles.memberCard, pressed && styles.pressed]}
            onPress={memberCard.onPress}
            accessibilityRole="button"
          >
            <View style={styles.memberCopy}>
              <Text style={styles.memberTitle}>{memberCard.title}</Text>
              <Text style={styles.memberSubtitle}>{memberCard.subtitle}</Text>
            </View>
            {(addressLoading || liveLoading) && isAuthenticated ? (
              <ActivityIndicator color={colors.pink} />
            ) : (
              <Ionicons name="chevron-forward" size={18} color="#b0a4a8" />
            )}
          </Pressable>

          {isAuthenticated ? (
            <View style={styles.journeyWrap}>
              <LearnerJourney
                journey={journey}
                variant="profile"
                onPressMilestone={(courseId) => router.push(`/course/${courseId}`)}
                onPressCta={(courseId) => {
                  if (courseId) router.push(`/course/${courseId}`);
                  else router.push('/(tabs)/learn');
                }}
              />
            </View>
          ) : null}

          {loggedInVia ? (
            <View style={styles.loggedRow}>
              <Text style={styles.loggedText}>{t('profile.loggedInVia', { via: loggedInVia })}</Text>
              <View style={styles.loggedRule} />
            </View>
          ) : (
            <View style={styles.loggedRow}>
              <Text style={styles.loggedText}>{t('profile.guestBrowse')}</Text>
              <View style={styles.loggedRule} />
            </View>
          )}

          <View style={styles.menuBlock}>
            {MENU_GROUPS.map((group) => {
              const rows = group.keys
                .map((key) => menuItems.find((item) => item.key === key))
                .filter((item): item is MenuItem => Boolean(item));
              return (
                <View key={group.id} style={styles.menuGroupWrap}>
                  <Text style={styles.menuGroupLabel}>{t(group.labelKey).toUpperCase()}</Text>
                  <View style={styles.menuGroup}>
                    {group.id === 'preferences' ? <LanguageSelector variant="menu" /> : null}
                    {rows.map((item, index) => (
                      <MenuRow
                        key={item.key}
                        title={item.title}
                        subtitle={item.subtitle}
                        icon={item.icon}
                        onPress={item.onPress}
                        isLast={index === rows.length - 1}
                        styles={styles}
                      />
                    ))}
                  </View>
                </View>
              );
            })}
          </View>

          {isAuthenticated ? (
            <Pressable
              style={({ pressed }) => [styles.logoutBtn, pressed && styles.pressed]}
              onPress={signOut}
              accessibilityRole="button"
            >
              <Text style={styles.logoutText}>{t('profile.logout')}</Text>
            </Pressable>
          ) : (
            <Pressable
              style={({ pressed }) => [styles.signInBtn, pressed && styles.pressed]}
              onPress={() => router.push('/login')}
              accessibilityRole="button"
            >
              <Text style={styles.signInBtnText}>{t('auth.signIn')}</Text>
            </Pressable>
          )}

          <LinearGradient
            colors={[...FOOTER_GRADIENT]}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.brandFooter}
          >
            <Text style={styles.footerBrand}>vivi</Text>
            <Text style={styles.footerVersion}>{t('profile.version', { version: APP_VERSION })}</Text>
            <View style={styles.footerGrid}>
              {(
                [
                  {
                    key: 'authenticity',
                    label: 'Authenticity',
                    icon: 'ribbon-outline',
                    onPress: () =>
                      Alert.alert(
                        'Authenticity',
                        'Every VIVI piece is handmade with care. What you see is what we stitch — authentic crochet from our studio.',
                      ),
                  },
                  {
                    key: 'privacy',
                    label: 'Privacy',
                    icon: 'lock-closed-outline',
                    onPress: () => router.push('/privacy-policy'),
                  },
                  {
                    key: 'terms',
                    label: 'Terms &\nConditions',
                    icon: 'document-text-outline',
                    onPress: () => router.push('/terms'),
                  },
                  {
                    key: 'rate',
                    label: 'Rate App',
                    icon: 'star-outline',
                    onPress: () => openStoreListing(t('profile.rateApp'), t('profile.rateAppBody')),
                  },
                  {
                    key: 'about',
                    label: 'About VIVI',
                    icon: 'information-circle-outline',
                    onPress: () =>
                      Alert.alert(
                        'About VIVI',
                        'VIVI Crochet is a Tamil Nadu handmade brand — crochet products, Learn & Loop courses, and live crochet circles.',
                      ),
                  },
                ] as FooterLink[]
              ).map((item) => (
                <Pressable
                  key={item.key}
                  style={({ pressed }) => [styles.footerItem, pressed && styles.pressed]}
                  onPress={item.onPress}
                  accessibilityRole="button"
                  accessibilityLabel={item.label.replace('\n', ' ')}
                >
                  <Ionicons name={item.icon} size={13} color={colors.pink} />
                  <Text style={styles.footerItemLabel} numberOfLines={1}>
                    {item.label.replace('\n', ' ')}
                  </Text>
                </Pressable>
              ))}
            </View>
          </LinearGradient>
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(fonts: UiFonts) {
  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.white,
  },
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  hero: {
    paddingHorizontal: spacing.md,
    paddingBottom: 56,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  brandMark: {
    fontFamily: fonts.heading,
    fontSize: 28,
    lineHeight: 34,
    color: colors.ink,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  iconBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.pink,
    borderWidth: 1.5,
    borderColor: '#f7e7c8',
  },
  cartBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  cartBadgeText: {
    fontFamily: fonts.nunitoBold,
    fontSize: 9,
    color: colors.white,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  greetingCopy: {
    flex: 1,
    minWidth: 0,
  },
  heyText: {
    fontFamily: fonts.nunitoBold,
    fontSize: 34,
    lineHeight: 40,
    color: colors.ink,
    letterSpacing: -0.4,
  },
  signInHint: {
    marginTop: 6,
    fontFamily: fonts.decorative,
    fontSize: 13,
    color: colors.pinkDark,
  },
  avatarWrap: {
    width: 72,
    height: 72,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#c4a484',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontFamily: fonts.nunitoBold,
    fontSize: 30,
    color: colors.white,
  },
  crownBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#e8c36a',
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crownGlyph: {
    fontSize: 12,
    color: '#7a5a12',
    marginTop: -1,
  },
  heroSpacer: {
    height: 8,
  },
  sheet: {
    marginTop: -42,
    paddingHorizontal: spacing.md,
  },
  memberCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...shadows.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.softBorder,
  },
  journeyWrap: {
    marginTop: 8,
  },
  memberCopy: {
    flex: 1,
    minWidth: 0,
  },
  memberTitle: {
    fontFamily: fonts.nunitoBold,
    fontSize: 15,
    color: colors.ink,
  },
  memberSubtitle: {
    marginTop: 4,
    fontFamily: fonts.decorative,
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
  },
  loggedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 18,
    marginBottom: 6,
  },
  loggedText: {
    fontFamily: fonts.decorative,
    fontSize: 12,
    color: '#9a8f93',
  },
  loggedRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e8e0e3',
  },
  menuBlock: {
    marginTop: 8,
    gap: 14,
  },
  menuGroupWrap: {
    gap: 6,
  },
  menuGroupLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    letterSpacing: 1.2,
    color: colors.pinkDark,
    paddingHorizontal: 4,
  },
  menuGroup: {
    backgroundColor: colors.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.pinkMist,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f6e4ea',
  },
  menuIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.pinkSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuRowLast: {
    borderBottomWidth: 0,
  },
  menuCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  menuTitle: {
    fontFamily: fonts.nunitoBold,
    fontSize: 14,
    color: colors.ink,
  },
  menuSubtitle: {
    marginTop: 1,
    fontFamily: fonts.decorative,
    fontSize: 11.5,
    lineHeight: 15,
    color: '#9a8f93',
  },
  logoutBtn: {
    marginTop: 16,
    marginBottom: 8,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#f6cddb',
  },
  logoutText: {
    fontFamily: fonts.nunitoBold,
    color: colors.pinkDark,
    fontSize: 14,
  },
  signInBtn: {
    marginTop: 16,
    marginBottom: 8,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: colors.pink,
  },
  signInBtnText: {
    fontFamily: fonts.nunitoBold,
    color: colors.white,
    fontSize: 14,
  },
  brandFooter: {
    marginTop: 18,
    paddingTop: 16,
    paddingBottom: 18,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#f6cddb',
    overflow: 'hidden',
  },
  footerBrand: {
    fontFamily: fonts.heading,
    fontSize: 30,
    color: colors.ink,
    letterSpacing: 1,
  },
  footerVersion: {
    marginTop: 2,
    fontFamily: fonts.regular,
    fontSize: 11,
    color: '#a0939a',
  },
  footerGrid: {
    marginTop: 12,
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.pinkMist,
  },
  footerItemLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.ink,
  },
  pressed: {
    opacity: 0.72,
  },
  });
}
