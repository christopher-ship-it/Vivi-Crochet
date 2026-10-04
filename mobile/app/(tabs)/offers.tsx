import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCourse } from '../../src/api/courses';
import { listMyEnrollments } from '../../src/api/enrollments';
import {
  getFoundingMembershipOffer,
  getMyMembership,
  type FoundingMembershipOffer,
  type MyMembership,
} from '../../src/api/offers';
import { ApiClientError } from '../../src/api/client';
import { useShoppingSession } from '../../src/auth/SessionContext';
import { AppImage } from '../../src/components/AppImage';
import { BrandWordmark } from '../../src/components/BrandWordmark';
import { MyViviPageGradient } from '../../src/components/MyViviPageGradient';
import { useTabDockClearance } from '../../src/components/PremiumTabBar';
import { ErrorView, LoadingView } from '../../src/components/StateViews';
import { useI18n } from '../../src/i18n';
import { uiFonts, type UiFonts } from '../../src/i18n/uiFonts';
import { colors, radii, spacing } from '../../src/theme';
import type { Course } from '../../src/types';
import { formatMoney } from '../../src/utils/format';
import { resolveCollectionOwnership } from '../../src/utils/mainCourses';
import { applyStatusBar } from '../../src/utils/statusBar';

const LESSON_COUNT = 27;
const STAGGER_MS = 50;
const ENTRANCE_MS = 260;

export default function OffersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dockClearance = useTabDockClearance();
  const { isAuthenticated } = useShoppingSession();
  const { t, language } = useI18n();
  const fonts = uiFonts(language);
  const styles = useMemo(() => createStyles(fonts), [language]);

  const [course, setCourse] = useState<Course | null>(null);
  const [includedCourseDetails, setIncludedCourseDetails] = useState<Course[]>([]);
  const [offer, setOffer] = useState<FoundingMembershipOffer | null>(null);
  const [membership, setMembership] = useState<MyMembership | null>(null);
  const [owned, setOwned] = useState(false);
  const [accessUntil, setAccessUntil] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleAnim = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;
  const priceAnim = useRef(new Animated.Value(0)).current;
  const ctaAnim = useRef(new Animated.Value(0)).current;
  const bannerBreath = useRef(new Animated.Value(1)).current;
  const ctaScale = useRef(new Animated.Value(1)).current;
  const priceScale = useRef(new Animated.Value(1)).current;
  const hasPlayedEntrance = useRef(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const offerData = await getFoundingMembershipOffer();
      const courseData = await getCourse(offerData.courseId);
      setOffer(offerData);
      setCourse(courseData);

      try {
        const included = await Promise.all(
          offerData.includedCourses.map((entry) => getCourse(entry.id)),
        );
        setIncludedCourseDetails(included);
      } catch {
        // Thumbnails are a visual nicety — fall back to the plain text list.
        setIncludedCourseDetails([]);
      }

      if (isAuthenticated) {
        try {
          const enrollments = await listMyEnrollments();
          const ownership = resolveCollectionOwnership(enrollments);
          setOwned(ownership.owned);
          setAccessUntil(ownership.accessUntil);
        } catch {
          setOwned(false);
          setAccessUntil(null);
        }
        try {
          setMembership(await getMyMembership());
        } catch {
          setMembership(null);
        }
      } else {
        setOwned(false);
        setAccessUntil(null);
        setMembership(null);
      }
    } catch (err) {
      setCourse(null);
      setIncludedCourseDetails([]);
      setOffer(null);
      setOwned(false);
      setAccessUntil(null);
      setMembership(null);
      if (err instanceof ApiClientError && err.code === 'OFFER_NOT_FOUND') {
        setError(t('offers.notReady'));
      } else {
        setError(
          err instanceof ApiClientError ? err.message : t('offers.loadFailed'),
        );
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t, isAuthenticated]);

  const playEntrance = useCallback((force = false) => {
    if (!force && hasPlayedEntrance.current) return;
    hasPlayedEntrance.current = true;
    titleAnim.setValue(0);
    cardAnim.setValue(0);
    priceAnim.setValue(0);
    ctaAnim.setValue(0);

    const makeStep = (value: Animated.Value, delay: number) =>
      Animated.timing(value, {
        toValue: 1,
        duration: ENTRANCE_MS,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      });

    Animated.parallel([
      makeStep(titleAnim, 0),
      makeStep(cardAnim, STAGGER_MS),
      makeStep(priceAnim, STAGGER_MS * 2),
      makeStep(ctaAnim, STAGGER_MS * 3),
    ]).start(({ finished }) => {
      // Never leave the offer card invisible if the animation was interrupted.
      if (!finished) {
        titleAnim.setValue(1);
        cardAnim.setValue(1);
        priceAnim.setValue(1);
        ctaAnim.setValue(1);
      }
    });
  }, [titleAnim, cardAnim, priceAnim, ctaAnim]);

  useFocusEffect(
    useCallback(() => {
      applyStatusBar('dark');
      void load();
      return () => {
        bannerBreath.stopAnimation();
        bannerBreath.setValue(1);
      };
    }, [load, bannerBreath]),
  );

  useEffect(() => {
    if (loading || error || !course) return;
    playEntrance();
  }, [loading, error, course, playEntrance]);

  const wasRefreshing = useRef(false);
  useEffect(() => {
    if (refreshing) {
      wasRefreshing.current = true;
      return;
    }
    if (!wasRefreshing.current || loading || error || !course) return;
    wasRefreshing.current = false;
    playEntrance(true);
  }, [refreshing, loading, error, course, playEntrance]);

  const showAsOwned = owned;
  const offerExhausted = Boolean(offer && (!offer.isActive || offer.remaining <= 0));
  const launchActive = Boolean(!showAsOwned && offer && !offerExhausted);

  useEffect(() => {
    if (!launchActive || loading || error || !course) {
      bannerBreath.stopAnimation();
      bannerBreath.setValue(1);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bannerBreath, {
          toValue: 0.88,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(bannerBreath, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [launchActive, loading, error, course, bannerBreath]);

  // Subtle, slow premium pulse on the ₹999 price only (never the whole card) — a small
  // scale-up, settle, pause, repeat. Skipped entirely when the OS reduced-motion setting is on.
  useEffect(() => {
    if (showAsOwned || loading || error || !course) {
      priceScale.stopAnimation();
      priceScale.setValue(1);
      return;
    }

    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled || reduce) return;
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(priceScale, {
              toValue: 1.045,
              duration: 700,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(priceScale, {
              toValue: 1,
              duration: 700,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.delay(1800),
          ]),
        );
        loop.start();
      });

    return () => {
      cancelled = true;
      loop?.stop();
      priceScale.setValue(1);
    };
  }, [showAsOwned, loading, error, course, priceScale]);

  const displayPrice = launchActive
    ? offer?.launchPrice ?? course?.price ?? 0
    : offer?.regularPriceAfterLaunch ?? course?.price ?? 0;
  const displayMrp = offer?.mrp ?? course?.mrp ?? null;
  // Prices arrive from the server in the user's currency; no price = not sold in their country.
  const currency = offer?.currency ?? course?.currency ?? 'INR';
  const money = (amount: number) => formatMoney(amount, currency);
  const unavailableInCountry =
    !showAsOwned && (offer?.availableInMarket === false || course?.availableInMarket === false);
  const accessDays = offer?.accessDurationDays ?? course?.accessDays ?? 30;
  const title = offer?.offerName || course?.name || t('offers.collectionName');

  const ctaLabel = showAsOwned ? t('offers.ctaOwned') : t('offers.cta');

  function openBundle() {
    if (showAsOwned) {
      // Owned collection → Learn tab (individual courses), never the bundle detail/lessons page.
      router.navigate('/(tabs)/learn');
      return;
    }
    if (!course) return;
    router.push({
      pathname: '/course/[id]',
      params: { id: course.id },
    });
  }

  function pressCtaIn() {
    Animated.spring(ctaScale, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 40,
      bounciness: 0,
    }).start();
  }

  function pressCtaOut() {
    Animated.spring(ctaScale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 28,
      bounciness: 6,
    }).start();
  }

  function fadeUp(value: Animated.Value) {
    return {
      opacity: value,
      transform: [
        {
          translateY: value.interpolate({
            inputRange: [0, 1],
            outputRange: [14, 0],
          }),
        },
      ],
    };
  }

  const accessUntilLabel = accessUntil
    ? new Date(accessUntil).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  const savings =
    displayMrp != null && displayMrp > displayPrice ? displayMrp - displayPrice : 0;
  const percentOff =
    savings > 0 && displayMrp ? Math.round((savings / displayMrp) * 100) : 0;
  const launchLimit = offer?.launchLimit ?? 100;
  const spotsRemaining =
    launchActive && offer ? Math.max(0, Math.min(launchLimit, offer.remaining)) : null;
  const spotsClaimedRatio =
    spotsRemaining != null && launchLimit > 0 ? (launchLimit - spotsRemaining) / launchLimit : 0;

  const includedCourses = offer?.includedCourses.length
    ? offer.includedCourses.map((c) => c.name)
    : t('offers.includesCourses')
        .split('·')
        .map((name) => name.trim())
        .filter(Boolean);

  const memberNumberLabel =
    showAsOwned && membership?.isMember && membership.memberNumber
      ? t('offers.founding.badgeLabel', {
          number: `${membership.isStudent ? 'S' : ''}${String(membership.memberNumber).padStart(3, '0')}`,
        })
      : null;

  const headTag = showAsOwned
    ? t('offers.ownedBadge')
    : launchActive
      ? offer?.badgeText?.trim() || t('offers.launchTag')
      : offerExhausted
        ? offer?.endedBadgeText?.trim() || t('offers.founding.offerEnded')
        : t('offers.eyebrow');

  if (loading && !course) {
    return (
      <MyViviPageGradient>
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <BrandWordmark />
        </View>
        <LoadingView message={t('common.loading')} />
      </MyViviPageGradient>
    );
  }

  if (error && !course) {
    return (
      <MyViviPageGradient>
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <BrandWordmark />
        </View>
        <ErrorView message={error} onRetry={() => void load()} />
      </MyViviPageGradient>
    );
  }

  return (
    <MyViviPageGradient>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingBottom: dockClearance + 24,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.pink}
          />
        }
      >
        <View style={styles.topBar}>
          <BrandWordmark />
        </View>

        <Animated.Text style={[styles.screenTitle, fadeUp(titleAnim)]}>
          {t('offers.title')}
        </Animated.Text>

        {course ? (
          <>
            {/* Coupon-style ticket: gradient head, perforation, white price body. */}
            <Animated.View style={[styles.ticket, fadeUp(cardAnim)]}>
              <LinearGradient
                colors={[colors.pink, colors.pinkDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.ticketHead}
              >
                <View style={[styles.glow, styles.glowTop]} pointerEvents="none" />
                <View style={[styles.glow, styles.glowBottom]} pointerEvents="none" />

                <Animated.View
                  style={[styles.tag, launchActive && { opacity: bannerBreath }]}
                >
                  <Ionicons
                    name={showAsOwned ? 'checkmark-circle' : 'flash'}
                    size={12}
                    color={colors.pinkDark}
                  />
                  <Text style={styles.tagText} numberOfLines={1}>
                    {headTag}
                  </Text>
                </Animated.View>

                <View style={styles.headRow}>
                  <View style={styles.headText}>
                    <Text style={styles.name}>{title}</Text>
                    <Text style={styles.altName}>{t('offers.altName')}</Text>
                  </View>
                  {!showAsOwned && percentOff > 0 ? (
                    <View style={styles.stamp}>
                      <Text style={styles.stampPercent}>
                        {t('offers.percentOff', { percent: percentOff })}
                      </Text>
                      <Text style={styles.stampOff}>{t('offers.off')}</Text>
                    </View>
                  ) : null}
                </View>
              </LinearGradient>

              <View style={styles.perforation}>
                <View style={styles.perforationLine} />
              </View>

              <View style={styles.ticketBody}>
                {showAsOwned ? (
                  <>
                    {memberNumberLabel ? (
                      <View style={styles.ownedRow}>
                        <Ionicons name="ribbon" size={16} color={colors.pink} />
                        <Text style={styles.ownedMeta}>{memberNumberLabel}</Text>
                      </View>
                    ) : null}
                    {accessUntilLabel ? (
                      <View style={styles.ownedRow}>
                        <Ionicons name="calendar-outline" size={16} color={colors.pink} />
                        <Text style={styles.ownedMeta}>
                          {t('offers.ownedMeta', { date: accessUntilLabel })}
                        </Text>
                      </View>
                    ) : null}
                  </>
                ) : unavailableInCountry ? (
                  <Text style={styles.note}>{t('market.membershipUnavailable')}</Text>
                ) : (
                  <Animated.View style={fadeUp(priceAnim)}>
                    <View style={styles.priceRow}>
                      <Animated.Text
                        style={[styles.price, { transform: [{ scale: priceScale }] }]}
                      >
                        {money(displayPrice)}
                      </Animated.Text>
                      {savings > 0 && displayMrp != null ? (
                        <Text style={styles.mrp}>{money(displayMrp)}</Text>
                      ) : null}
                    </View>
                    {savings > 0 ? (
                      <View style={styles.saveChip}>
                        <Ionicons name="pricetag" size={12} color={colors.success} />
                        <Text style={styles.saveText}>
                          {t('offers.youSave', { amount: money(savings) })}
                        </Text>
                      </View>
                    ) : null}
                  </Animated.View>
                )}

                {spotsRemaining != null && !unavailableInCountry ? (
                  <View style={styles.spots}>
                    <View style={styles.spotsHeader}>
                      <Ionicons name="flame" size={14} color={colors.pink} />
                      <Text style={styles.spotsText}>
                        {t('offers.spotsLeft', { count: spotsRemaining })}
                      </Text>
                    </View>
                    <View style={styles.spotsTrack}>
                      <LinearGradient
                        colors={[colors.pink, colors.pinkDark]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[
                          styles.spotsFill,
                          { width: `${Math.max(6, spotsClaimedRatio * 100)}%` },
                        ]}
                      />
                    </View>
                    <Text style={styles.spotsHurry}>{t('offers.spotsHurry')}</Text>
                  </View>
                ) : null}

                {unavailableInCountry ? null : (
                <Animated.View
                  style={[
                    styles.ctaWrap,
                    {
                      opacity: ctaAnim,
                      transform: [
                        {
                          translateY: ctaAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [14, 0],
                          }),
                        },
                        { scale: ctaScale },
                      ],
                    },
                  ]}
                >
                  <Pressable
                    onPress={openBundle}
                    onPressIn={pressCtaIn}
                    onPressOut={pressCtaOut}
                    accessibilityRole="button"
                    accessibilityLabel={ctaLabel}
                  >
                    <LinearGradient
                      colors={
                        showAsOwned
                          ? [colors.pinkDark, colors.pinkDark]
                          : [colors.pink, colors.pinkDark]
                      }
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.cta}
                    >
                      <Text style={styles.ctaText}>{ctaLabel}</Text>
                    </LinearGradient>
                  </Pressable>
                </Animated.View>
                )}

                {!showAsOwned && !unavailableInCountry ? (
                  <View style={styles.noteRow}>
                    <Ionicons name="lock-closed" size={11} color={colors.muted} />
                    <Text style={styles.note}>
                      {t('offers.priceNote', { days: accessDays })}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Animated.View>

            <Animated.View style={[styles.included, fadeUp(ctaAnim)]}>
              <Text style={styles.includedTitle}>{t('offers.whatsIncluded')}</Text>

              {includedCourses.map((name, index) => {
                const thumb = includedCourseDetails[index]?.thumbnailUrl?.trim();
                return (
                  <View key={name} style={styles.includedRow}>
                    <View style={styles.includedIcon}>
                      {thumb ? (
                        <AppImage
                          uri={thumb}
                          style={styles.includedThumb}
                          contentFit="cover"
                          accessibilityLabel={name}
                        />
                      ) : (
                        <Text style={styles.includedIndex}>{index + 1}</Text>
                      )}
                    </View>
                    <View style={styles.includedTextWrap}>
                      <Text style={styles.includedName}>{name}</Text>
                      <Text style={styles.includedSub}>{t('offers.courseIncluded')}</Text>
                    </View>
                    <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                  </View>
                );
              })}

              {offer?.viralProject ? (
                <View style={styles.includedRow}>
                  <View style={styles.includedIcon}>
                    {offer.viralProject.thumbnailUrl ? (
                      <AppImage
                        uri={offer.viralProject.thumbnailUrl}
                        style={styles.includedThumb}
                        contentFit="cover"
                        accessibilityLabel={offer.viralProject.name}
                      />
                    ) : (
                      <Ionicons name="sparkles" size={18} color={colors.pinkDark} />
                    )}
                  </View>
                  <View style={styles.includedTextWrap}>
                    <Text style={styles.includedName}>{offer.viralProject.name}</Text>
                    <Text style={styles.includedSub}>{t('offers.founding.viralProjectIncluded')}</Text>
                  </View>
                  <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                </View>
              ) : null}

              <View style={styles.includedDivider} />

              <View style={styles.perkRow}>
                <Ionicons name="play-circle-outline" size={18} color={colors.pink} />
                <Text style={styles.perkText}>
                  {t('offers.lessonsIncluded', {
                    count: course.videoCount > 0 ? course.videoCount : LESSON_COUNT,
                  })}
                </Text>
              </View>
              <View style={styles.perkRow}>
                <Ionicons name="time-outline" size={18} color={colors.pink} />
                <Text style={styles.perkText}>
                  {t('offers.accessDays', { days: accessDays })}
                </Text>
              </View>
              <View style={styles.perkRow}>
                <Ionicons name="ribbon-outline" size={18} color={colors.pink} />
                <Text style={styles.perkText}>{t('offers.founding.badgePerk')}</Text>
              </View>
              {course.languages ? (
                <View style={styles.perkRow}>
                  <Ionicons name="language-outline" size={18} color={colors.pink} />
                  <Text style={styles.perkText}>
                    {t('offers.taughtIn', { languages: course.languages })}
                  </Text>
                </View>
              ) : null}
            </Animated.View>
          </>
        ) : null}
      </ScrollView>
    </MyViviPageGradient>
  );
}

function createStyles(fonts: UiFonts) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
    },
    topBar: {
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.md,
    },
    screenTitle: {
      fontFamily: fonts.extraBold,
      fontSize: 22,
      color: colors.ink,
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.md,
    },
    ticket: {
      marginHorizontal: spacing.lg,
      borderRadius: radii.xl,
      backgroundColor: colors.white,
      shadowColor: colors.pinkDark,
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.22,
      shadowRadius: 22,
      elevation: 8,
    },
    ticketHead: {
      borderTopLeftRadius: radii.xl,
      borderTopRightRadius: radii.xl,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.md + 4,
      overflow: 'hidden',
    },
    glow: {
      position: 'absolute',
      borderRadius: radii.pill,
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    glowTop: {
      width: 180,
      height: 180,
      top: -90,
      right: -50,
    },
    glowBottom: {
      width: 120,
      height: 120,
      bottom: -70,
      left: -30,
    },
    tag: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: colors.yellow,
      borderRadius: radii.pill,
      paddingHorizontal: 9,
      paddingVertical: 4,
      marginBottom: spacing.sm + 2,
      maxWidth: '100%',
    },
    tagText: {
      fontFamily: fonts.extraBold,
      fontSize: 10,
      letterSpacing: 0.8,
      color: colors.ink,
    },
    headRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    headText: {
      flex: 1,
    },
    name: {
      fontFamily: fonts.extraBold,
      fontSize: 21,
      lineHeight: 26,
      color: colors.white,
    },
    altName: {
      fontFamily: fonts.semiBold,
      fontSize: 12,
      color: 'rgba(255, 255, 255, 0.82)',
      marginTop: 3,
    },
    stamp: {
      width: 66,
      height: 66,
      borderRadius: 33,
      backgroundColor: colors.white,
      borderWidth: 2,
      borderColor: colors.yellow,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
      transform: [{ rotate: '-10deg' }],
    },
    stampPercent: {
      fontFamily: fonts.extraBold,
      fontSize: 19,
      lineHeight: 21,
      color: colors.pink,
    },
    stampOff: {
      fontFamily: fonts.extraBold,
      fontSize: 10,
      letterSpacing: 1.1,
      color: colors.ink,
    },
    perforation: {
      height: 1,
      marginHorizontal: spacing.md,
      overflow: 'hidden',
    },
    perforationLine: {
      height: 2,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderStyle: 'dashed',
      borderRadius: 1,
    },
    ticketBody: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.md,
    },
    priceRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 9,
    },
    price: {
      fontFamily: fonts.extraBold,
      fontSize: 30,
      lineHeight: 36,
      color: colors.ink,
    },
    mrp: {
      fontFamily: fonts.semiBold,
      fontSize: 15,
      color: colors.muted,
      textDecorationLine: 'line-through',
    },
    saveChip: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(26, 122, 74, 0.1)',
      borderRadius: radii.pill,
      paddingHorizontal: 10,
      paddingVertical: 5,
      marginTop: 6,
    },
    saveText: {
      fontFamily: fonts.extraBold,
      fontSize: 12,
      color: colors.success,
    },
    ownedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 6,
    },
    ownedMeta: {
      fontFamily: fonts.semiBold,
      fontSize: 14,
      color: colors.ink,
    },
    spots: {
      marginTop: spacing.sm + 2,
      padding: 10,
      borderRadius: radii.md,
      backgroundColor: colors.pinkSoft,
    },
    spotsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 8,
    },
    spotsText: {
      fontFamily: fonts.extraBold,
      fontSize: 13,
      color: colors.pinkDark,
    },
    spotsTrack: {
      height: 8,
      borderRadius: radii.pill,
      backgroundColor: colors.pinkMist,
      overflow: 'hidden',
    },
    spotsFill: {
      height: '100%',
      borderRadius: radii.pill,
    },
    spotsHurry: {
      fontFamily: fonts.regular,
      fontSize: 11,
      color: colors.muted,
      marginTop: 6,
    },
    ctaWrap: {
      marginTop: spacing.md,
      borderRadius: radii.md,
      shadowColor: colors.pink,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 5,
    },
    cta: {
      borderRadius: radii.md,
      paddingVertical: 14,
      paddingHorizontal: spacing.md,
      alignItems: 'center',
    },
    ctaText: {
      fontFamily: fonts.extraBold,
      fontSize: 14,
      letterSpacing: 0.4,
      color: colors.white,
      textAlign: 'center',
    },
    noteRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      marginTop: 10,
    },
    note: {
      fontFamily: fonts.semiBold,
      fontSize: 11,
      color: colors.muted,
    },
    included: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.lg,
      padding: spacing.lg,
      borderRadius: radii.xl,
      backgroundColor: 'rgba(255, 255, 255, 0.78)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255, 255, 255, 0.9)',
    },
    includedTitle: {
      fontFamily: fonts.extraBold,
      fontSize: 17,
      color: colors.ink,
      marginBottom: spacing.md,
    },
    includedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 12,
    },
    includedIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: colors.pinkMist,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    includedThumb: {
      width: '100%',
      height: '100%',
    },
    includedIndex: {
      fontFamily: fonts.extraBold,
      fontSize: 14,
      color: colors.pinkDark,
    },
    includedTextWrap: {
      flex: 1,
    },
    includedName: {
      fontFamily: fonts.extraBold,
      fontSize: 14,
      color: colors.ink,
    },
    includedSub: {
      fontFamily: fonts.regular,
      fontSize: 12,
      color: colors.muted,
      marginTop: 1,
    },
    includedDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginVertical: spacing.sm,
    },
    perkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 8,
    },
    perkText: {
      fontFamily: fonts.semiBold,
      fontSize: 14,
      color: colors.ink,
    },
  });
}
