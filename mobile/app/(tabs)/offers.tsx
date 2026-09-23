import { BlurView } from 'expo-blur';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCourse, listCourses } from '../../src/api/courses';
import {
  getCoursePricing,
  listMyEnrollments,
  type CoursePricing,
} from '../../src/api/enrollments';
import { ApiClientError } from '../../src/api/client';
import { useShoppingSession } from '../../src/auth/SessionContext';
import { BrandWordmark } from '../../src/components/BrandWordmark';
import { MyViviPageGradient } from '../../src/components/MyViviPageGradient';
import { useTabDockClearance } from '../../src/components/PremiumTabBar';
import { ErrorView, LoadingView } from '../../src/components/StateViews';
import { useI18n } from '../../src/i18n';
import { uiFonts, type UiFonts } from '../../src/i18n/uiFonts';
import { colors, radii, spacing } from '../../src/theme';
import type { Course } from '../../src/types';
import { formatInr } from '../../src/utils/format';
import {
  COMPLETE_COLLECTION_BUNDLE_ID,
  resolveCollectionOwnership,
} from '../../src/utils/mainCourses';
import { applyStatusBar } from '../../src/utils/statusBar';

const LESSON_COUNT = 27;
const STAGGER_MS = 50;
const ENTRANCE_MS = 260;

async function resolveBundleCourse(): Promise<Course> {
  try {
    return await getCourse(COMPLETE_COLLECTION_BUNDLE_ID);
  } catch (err) {
    if (!(err instanceof ApiClientError) || err.status !== 404) throw err;
  }

  const all = await listCourses();
  const bundle =
    all.find((c) => c.id === COMPLETE_COLLECTION_BUNDLE_ID)
    ?? all.find((c) => c.type === 'Bundle')
    ?? all.find((c) => /complete crochet collection|all-access crochet pass/i.test(c.name));

  if (!bundle) {
    throw new ApiClientError(404, 'OFFER_NOT_READY', 'OFFER_NOT_READY');
  }
  return bundle;
}

export default function OffersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dockClearance = useTabDockClearance();
  const { isAuthenticated } = useShoppingSession();
  const { t, language } = useI18n();
  const fonts = uiFonts(language);
  const styles = useMemo(() => createStyles(fonts), [language]);

  const [course, setCourse] = useState<Course | null>(null);
  const [pricing, setPricing] = useState<CoursePricing | null>(null);
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
  const hasPlayedEntrance = useRef(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const courseData = await resolveBundleCourse();
      const pricingData = await getCoursePricing(courseData.id);
      setCourse(courseData);
      setPricing(pricingData);

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
      } else {
        setOwned(false);
        setAccessUntil(null);
      }
    } catch (err) {
      setCourse(null);
      setPricing(null);
      setOwned(false);
      setAccessUntil(null);
      if (err instanceof ApiClientError && err.code === 'OFFER_NOT_READY') {
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

  const isRenewalOffer = Boolean(pricing?.isRenewalOffer);
  const showAsOwned = owned && !isRenewalOffer;
  const launchActive = Boolean(
    !showAsOwned && (pricing?.launchOfferActive ?? pricing?.isLaunchOffer),
  );

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

  const displayPrice = pricing?.applicablePrice ?? pricing?.price ?? course?.price ?? 0;
  const displayMrp = pricing?.mrp ?? course?.mrp ?? null;
  const accessDays = pricing?.accessDays ?? course?.accessDays ?? 30;
  const title =
    pricing?.name
    || pricing?.courseName
    || course?.name
    || t('offers.collectionName');

  const ctaLabel = showAsOwned
    ? t('offers.ctaOwned')
    : isRenewalOffer
      ? t('learn.renewCtaWithDiscount', {
          price: formatInr(displayPrice),
          percent: pricing?.renewalPercentage ?? 50,
        })
      : t('offers.cta');

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

  const offerCardBody = course ? (
    <>
      <Text style={styles.eyebrow}>
        {showAsOwned ? t('offers.ownedBadge') : t('offers.eyebrow')}
      </Text>
      <Text style={styles.name}>{title}</Text>
      <Text style={styles.altName}>{t('offers.altName')}</Text>

      {showAsOwned ? (
        accessUntilLabel ? (
          <Text style={styles.ownedMeta}>
            {t('offers.ownedMeta', { date: accessUntilLabel })}
          </Text>
        ) : null
      ) : (
        <Animated.View style={[styles.priceBlock, fadeUp(priceAnim)]}>
          {displayMrp != null && displayMrp > displayPrice ? (
            <Text style={styles.mrp}>{formatInr(displayMrp)}</Text>
          ) : null}
          <Text style={styles.price}>{formatInr(displayPrice)}</Text>
        </Animated.View>
      )}

      {launchActive ? (
        <Animated.Text style={[styles.launchBanner, { opacity: bannerBreath }]}>
          {t('offers.launchBanner')}
        </Animated.Text>
      ) : null}

      {!showAsOwned ? (
        <>
          <Text style={styles.meta}>
            {t('offers.accessDays', { days: accessDays })}
          </Text>
          <Text style={styles.meta}>
            {t('offers.lessonsIncluded', { count: LESSON_COUNT })}
          </Text>
        </>
      ) : null}
      <Text style={styles.includes}>{t('offers.includesCourses')}</Text>

      <Animated.View
        style={{
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
        }}
      >
        <Pressable
          style={[styles.cta, showAsOwned && styles.ctaOwned]}
          onPress={openBundle}
          onPressIn={pressCtaIn}
          onPressOut={pressCtaOut}
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
        >
          <Text style={styles.ctaText}>{ctaLabel}</Text>
        </Pressable>
      </Animated.View>
    </>
  ) : null;

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

        <Animated.View style={[styles.cardShell, fadeUp(cardAnim)]}>
          {Platform.OS === 'ios' ? (
            <BlurView intensity={36} tint="light" style={styles.card}>
              {offerCardBody}
            </BlurView>
          ) : (
            <View style={[styles.card, styles.cardAndroid]}>{offerCardBody}</View>
          )}
        </Animated.View>
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
    cardShell: {
      marginHorizontal: spacing.lg,
      borderRadius: radii.lg,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255, 255, 255, 0.62)',
      // Soft liquid highlight edge
      shadowColor: colors.pink,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.12,
      shadowRadius: 20,
      elevation: 4,
    },
    card: {
      padding: spacing.lg,
      backgroundColor: 'rgba(255, 255, 255, 0.28)',
      overflow: 'hidden',
    },
    cardAndroid: {
      backgroundColor: 'rgba(255, 248, 250, 0.82)',
    },
    eyebrow: {
      fontFamily: fonts.extraBold,
      fontSize: 10,
      letterSpacing: 1.6,
      color: colors.pink,
      marginBottom: 8,
    },
    name: {
      fontFamily: fonts.extraBold,
      fontSize: 22,
      lineHeight: 28,
      color: colors.ink,
    },
    altName: {
      fontFamily: fonts.semiBold,
      fontSize: 13,
      color: colors.muted,
      marginTop: 4,
      marginBottom: spacing.md,
    },
    priceBlock: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 10,
      marginBottom: spacing.sm,
    },
    ownedMeta: {
      fontFamily: fonts.semiBold,
      fontSize: 14,
      color: colors.ink,
      marginBottom: spacing.md,
    },
    mrp: {
      fontFamily: fonts.regular,
      fontSize: 16,
      color: colors.muted,
      textDecorationLine: 'line-through',
    },
    price: {
      fontFamily: fonts.extraBold,
      fontSize: 28,
      color: colors.ink,
    },
    launchBanner: {
      fontFamily: fonts.semiBold,
      fontSize: 12,
      lineHeight: 18,
      color: colors.pinkDark,
      backgroundColor: 'rgba(255, 255, 255, 0.42)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255, 255, 255, 0.7)',
      borderRadius: radii.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: spacing.md,
      overflow: 'hidden',
    },
    meta: {
      fontFamily: fonts.semiBold,
      fontSize: 14,
      color: colors.ink,
      marginBottom: 4,
    },
    includes: {
      fontFamily: fonts.regular,
      fontSize: 13,
      lineHeight: 19,
      color: colors.muted,
      marginTop: 8,
      marginBottom: spacing.lg,
    },
    cta: {
      backgroundColor: colors.pink,
      borderRadius: radii.md,
      paddingVertical: 16,
      alignItems: 'center',
    },
    ctaOwned: {
      backgroundColor: colors.pinkDark,
    },
    ctaText: {
      fontFamily: fonts.extraBold,
      fontSize: 13,
      letterSpacing: 0.4,
      color: colors.white,
    },
  });
}
