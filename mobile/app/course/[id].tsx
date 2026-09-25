import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCourse } from '../../src/api/courses';
import {
  completeMyEnrollment,
  getCoursePricing,
  getMyEnrollment,
  listMyEnrollments,
  type CoursePricing,
  type Enrollment,
} from '../../src/api/enrollments';
import { createOrder } from '../../src/api/orders';
import { getMyProfile, updateMyProfile } from '../../src/api/me';
import { verifyRazorpayPayment } from '../../src/api/payments';
import { ApiClientError } from '../../src/api/client';
import { useLearningCustomer, useShoppingSession } from '../../src/auth/SessionContext';
import {
  isUsableCustomerEmail,
  isValidName,
  normalizePhone,
  phoneFromCustomerLoginEmail,
  realCustomerName,
  sanitizeEmail,
} from '../../src/utils/validation';
import {
  RazorpayCheckoutModal,
  type RazorpayCheckoutPayload,
  type RazorpaySuccessPayload,
} from '../../src/components/RazorpayCheckoutModal';
import { UnlockLearnModal } from '../../src/components/UnlockLearnModal';
import { BackButton } from '../../src/components/BackButton';
import { BrandWordmark } from '../../src/components/BrandWordmark';
import { CourseLearningPath } from '../../src/components/CourseLearningPath';
import { LessonDurationBackfill } from '../../src/components/LessonDurationBackfill';
import { HeroGradient } from '../../src/components/HeroGradient';
import { ErrorView, LoadingView } from '../../src/components/StateViews';
import type { Course, CourseLesson } from '../../src/types';
import { colors, fonts, radii, shadows, spacing } from '../../src/theme';
import {
  COURSE_TYPE_LABELS,
  formatCourseMeta,
  formatDuration,
  formatInr,
} from '../../src/utils/format';
import { getCoursePathCursor, setCoursePathCursor } from '../../src/utils/coursePathProgress';
import { isLastLessonInCourse } from '../../src/utils/learnerJourney';
import {
  getMainCourseWhatYouGetKey,
  isCompleteCollectionBundle,
  resolveCollectionOwnership,
} from '../../src/utils/mainCourses';
import { useI18n } from '../../src/i18n';

export default function CourseDetailScreen() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, user } = useShoppingSession();
  const { profile: learningProfile, saveProfile: saveLearningProfile } = useLearningCustomer();
  const [course, setCourse] = useState<Course | null>(null);
  const [pricing, setPricing] = useState<CoursePricing | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [collectionOwned, setCollectionOwned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unlockVisible, setUnlockVisible] = useState(false);
  const [unlockAutoSendCode, setUnlockAutoSendCode] = useState(false);
  const [pendingLesson, setPendingLesson] = useState<CourseLesson | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [checkoutPayload, setCheckoutPayload] = useState<RazorpayCheckoutPayload | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [pathCursorId, setPathCursorId] = useState<string | null>(null);

  const hasLearningProfile = Boolean(learningProfile);
  const isBundle = isCompleteCollectionBundle(course);
  const hasAccess = Boolean(enrollment?.isActive) || (isBundle && collectionOwned);

  const daysUntilExpiry = useMemo(() => {
    if (!enrollment?.accessExpiryDate || enrollment.isExpired) return null;
    const end = new Date(enrollment.accessExpiryDate);
    if (Number.isNaN(end.getTime())) return null;
    const today = new Date();
    const startUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
    return Math.round((endUtc - startUtc) / 86_400_000);
  }, [enrollment?.accessExpiryDate, enrollment?.isExpired]);

  const showExpiryReminder = daysUntilExpiry != null && daysUntilExpiry >= 0 && daysUntilExpiry <= 3;

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [courseData, pricingData] = await Promise.all([
        getCourse(id),
        getCoursePricing(id).catch(() => null),
      ]);
      setCourse(courseData);
      setPricing(pricingData);

      if (isAuthenticated) {
        const bundleCourse = isCompleteCollectionBundle(courseData);
        try {
          if (bundleCourse) {
            // Bundle checkout enrolls the three child courses, not the bundle row.
            const enrollments = await listMyEnrollments();
            const ownership = resolveCollectionOwnership(enrollments);
            setCollectionOwned(ownership.owned);
            setEnrollment(null);
          } else {
            setCollectionOwned(false);
            setEnrollment(await getMyEnrollment(id));
          }
        } catch (err) {
          setCollectionOwned(false);
          if (err instanceof ApiClientError && err.status === 404) {
            setEnrollment(null);
          } else {
            setEnrollment(null);
          }
        }
      } else {
        setCollectionOwned(false);
        setEnrollment(null);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load course.');
    } finally {
      setLoading(false);
    }
  }, [id, isAuthenticated]);

  useEffect(() => {
    load();
  }, [load]);

  // Owned All-Access Pass → Learn (individual courses), never bundle lesson list.
  useEffect(() => {
    if (loading || !course || !isCompleteCollectionBundle(course) || !collectionOwned) return;
    router.replace('/(tabs)/learn');
  }, [loading, course, collectionOwned, router]);

  const pathOwnerId = user?.id ?? 'guest';

  useEffect(() => {
    if (!id || !hasAccess) return;
    void getCoursePathCursor(id, pathOwnerId).then(setPathCursorId);
  }, [id, hasAccess, pathOwnerId]);

  function requireSignIn() {
    if (!id) return;
    router.push({
      pathname: '/login',
      params: { returnTo: `/course/${id}` },
    });
  }

  function openLesson(lesson: CourseLesson) {
    if (lesson.isFreePreview || hasAccess) {
      if (hasAccess && id) {
        void setCoursePathCursor(id, lesson.id, pathOwnerId);
        setPathCursorId(lesson.id);
        const sorted = (course?.lessons ?? [])
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder);
        if (
          enrollment &&
          !enrollment.completedFlag &&
          isLastLessonInCourse(sorted, lesson.id)
        ) {
          void completeMyEnrollment(id)
            .then((updated) => setEnrollment(updated))
            .catch(() => {
              /* journey mark is best-effort */
            });
        }
      }
      router.push({
        pathname: '/lesson/[id]',
        params: { id: lesson.id, courseName: course?.name ?? '', courseId: course?.id ?? id ?? '' },
      });
      return;
    }

    // Guests must sign in / create an account before purchase details.
    if (!isAuthenticated) {
      requireSignIn();
      return;
    }

    if (!hasLearningProfile) {
      setPendingLesson(lesson);
      setUnlockAutoSendCode(false);
      setUnlockVisible(true);
      return;
    }

    Alert.alert(
      'Purchase required',
      'This lesson unlocks after you buy the course.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Purchase', onPress: () => void startPurchase() },
      ],
    );
  }

  function handleUnlockContinue() {
    setUnlockVisible(false);
    setUnlockAutoSendCode(false);
    setBanner(null);
    if (!isAuthenticated) {
      requireSignIn();
      return;
    }
    if (pendingLesson) {
      const lesson = pendingLesson;
      setPendingLesson(null);
      if (lesson.isFreePreview) {
        router.push({
          pathname: '/lesson/[id]',
          params: { id: lesson.id, courseName: course?.name ?? '', courseId: course?.id ?? id ?? '' },
        });
        return;
      }
      void startPurchase();
      return;
    }
    // Details collected mid-checkout (email verify) — resume pay.
    void startPurchase();
  }

  function openUnlockForDetails(message?: string, autoSendCode = false) {
    if (!isAuthenticated) {
      requireSignIn();
      return;
    }
    setPendingLesson(null);
    setUnlockAutoSendCode(autoSendCode);
    setUnlockVisible(true);
    setBanner(message ?? null);
  }

  async function startPurchase() {
    if (!course || !id) return;

    if (!isAuthenticated) {
      requireSignIn();
      return;
    }

    setPurchasing(true);
    setBanner(null);
    setError(null);
    try {
      let name = realCustomerName(learningProfile?.fullName, user?.name);
      let email = isUsableCustomerEmail(learningProfile?.email)
        ? sanitizeEmail(learningProfile?.email)
        : '';
      let phone =
        normalizePhone(learningProfile?.phone || user?.phone || phoneFromCustomerLoginEmail(user?.email))
        || '';
      let emailVerified = false;

      try {
        const profile = await getMyProfile();
        name = realCustomerName(profile.fullName, name);
        phone = normalizePhone(profile.phoneNumber) || phone;
        const profileEmail = sanitizeEmail(profile.email);
        if (isUsableCustomerEmail(profileEmail)) {
          email = profileEmail;
          emailVerified = Boolean(profile.isEmailVerified);
          if (emailVerified) {
            await saveLearningProfile({
              fullName: name,
              phone,
              email,
            });
          }
        }
      } catch {
        // Use local learning profile if profile fetch fails.
      }

      if (!isValidName(name) || !isUsableCustomerEmail(email) || !emailVerified) {
        openUnlockForDetails(
          !isUsableCustomerEmail(email)
            ? 'Add your name and email so we can notify you about your order.'
            : 'Verify your email with the 6-digit code we send, then continue to pay.',
          Boolean(isUsableCustomerEmail(email) && !emailVerified),
        );
        return;
      }

      await updateMyProfile({
        fullName: name,
        email,
      });

      const itemType = course.type === 'Bundle' ? 'CourseBundle' : 'Course';
      const order = await createOrder([
        {
          itemType,
          courseId: course.id,
          quantity: 1,
        },
      ]);

      setPendingOrderId(order.orderId);
      setCheckoutPayload({
        keyId: order.razorpayKeyId,
        orderId: order.razorpayOrderId,
        amountPaise: order.amountPaise,
        currency: order.currency,
        name: 'VIVI Crochet',
        description: course.name,
        prefillName: name,
        prefillEmail: email,
        prefillContact: phone || learningProfile?.phone || user?.phone || undefined,
      });
      setCheckoutVisible(true);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'EMAIL_VERIFICATION_REQUIRED') {
        openUnlockForDetails(
          'Verify your email with the 6-digit code we send, then continue to pay.',
          true,
        );
        return;
      }
      const message = err instanceof ApiClientError ? err.message : 'Could not start checkout.';
      setBanner(message);
      Alert.alert('Checkout failed', message);
    } finally {
      setPurchasing(false);
    }
  }

  async function handlePaymentSuccess(result: RazorpaySuccessPayload) {
    if (!pendingOrderId) return;
    setCheckoutVisible(false);
    setCheckoutPayload(null);
    setPurchasing(true);
    try {
      await verifyRazorpayPayment({
        internalOrderId: pendingOrderId,
        razorpayOrderId: result.razorpay_order_id,
        razorpayPaymentId: result.razorpay_payment_id,
        razorpaySignature: result.razorpay_signature,
      });
      router.replace({
        pathname: '/order-confirmation',
        params: { orderId: pendingOrderId },
      });
    } catch (err) {
      const message = err instanceof ApiClientError
        ? err.message
        : 'Payment received but verification failed. Contact support with your order details.';
      setBanner(message);
      Alert.alert('Verification failed', message);
    } finally {
      setPurchasing(false);
      setPendingOrderId(null);
    }
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.container, { paddingTop: insets.top }]}>
          <HeroGradient style={styles.topBar}>
            <BackButton fallbackHref="/(tabs)/learn" />
            <BrandWordmark size="sm" />
            <View style={styles.topBarSpacer} />
          </HeroGradient>
          <LoadingView message={t('learn.loadingCourse')} />
        </View>
      </>
    );
  }
  if (error || !course) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.container, { paddingTop: insets.top }]}>
          <HeroGradient style={styles.topBar}>
            <BackButton fallbackHref="/(tabs)/learn" />
            <BrandWordmark size="sm" />
            <View style={styles.topBarSpacer} />
          </HeroGradient>
          <ErrorView message={error ?? 'Course not found.'} onRetry={load} />
        </View>
      </>
    );
  }

  const lessons = (course.lessons ?? [])
    .filter((lesson) => lesson.status === 'Published')
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const displayPrice = pricing?.applicablePrice ?? course.price;
  const displayMrp = pricing?.mrp ?? course.mrp;
  const isRenewalOffer = Boolean(pricing?.isRenewalOffer);
  const renewalPercent = pricing?.renewalPercentage ?? course.renewalPercentage ?? 50;
  const showPurchaseFooter = (!hasAccess || isRenewalOffer) && !(isBundle && collectionOwned && !isRenewalOffer);
  // Prefer admin "What you get" (About), then Description, then catalog package copy.
  const packageWhatYouGetKey = getMainCourseWhatYouGetKey(course);
  const whatYouGetLine =
    course.about?.trim() ||
    course.description?.trim() ||
    (packageWhatYouGetKey ? t(packageWhatYouGetKey) : null);
  const payButtonLabel = purchasing
    ? 'Starting checkout…'
    : isRenewalOffer
      ? t('learn.renewCtaWithDiscount', {
          price: formatInr(displayPrice),
          percent: renewalPercent,
        })
      : `Pay Online · ${formatInr(displayPrice)}`;
  const pathCurrentIndex = Math.max(
    0,
    lessons.findIndex((lesson) => lesson.id === pathCursorId),
  );

  // Bundle owned users are redirected to Learn — avoid flashing locked/raw lesson rows.
  if (isBundle && collectionOwned && !isRenewalOffer) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.container, { paddingTop: insets.top }]}>
          <HeroGradient style={styles.topBar}>
            <BackButton fallbackHref="/(tabs)/learn" />
            <BrandWordmark size="sm" />
            <View style={styles.topBarSpacer} />
          </HeroGradient>
          <LoadingView message={t('common.loading')} />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, hasAccess && styles.contentUnlocked]}
          showsVerticalScrollIndicator={false}
        >
          {hasAccess ? (
            <>
              <HeroGradient>
                <View style={styles.topBar}>
                  <BackButton fallbackHref="/(tabs)/learn" />
                  <BrandWordmark size="sm" />
                  <View style={styles.topBarSpacer} />
                </View>
                <View style={styles.unlockedHero}>
                  <Text style={styles.unlockedTitle}>{course.name}</Text>
                  {enrollment ? (
                    <Text style={styles.accessActive}>
                      Access until {new Date(enrollment.accessExpiryDate).toLocaleDateString('en-IN')}
                    </Text>
                  ) : null}
                </View>
              </HeroGradient>

              {showExpiryReminder ? (
                <View style={styles.expiryReminder}>
                  <Text style={styles.expiryReminderEyebrow}>
                    {t('learn.expiryReminderEyebrow').toUpperCase()}
                  </Text>
                  <Text style={styles.expiryReminderText}>
                    {daysUntilExpiry === 0
                      ? t('learn.expiryReminderToday')
                      : daysUntilExpiry === 1
                        ? t('learn.expiryReminderOneDay')
                        : t('learn.expiryReminderDays', { days: daysUntilExpiry })}
                  </Text>
                </View>
              ) : null}

              {banner && (
                <View style={styles.banner}>
                  <Text style={styles.bannerText}>{banner}</Text>
                </View>
              )}

              {isBundle ? (
                <View style={styles.block}>
                  <Pressable
                    style={styles.unlockBtn}
                    onPress={() => router.navigate('/(tabs)/learn')}
                    accessibilityRole="button"
                    accessibilityLabel={t('offers.ctaOwned')}
                  >
                    <Text style={styles.unlockBtnText}>{t('offers.ctaOwned')}</Text>
                  </Pressable>
                </View>
              ) : lessons.length === 0 ? (
                <View style={styles.block}>
                  <Text style={styles.body}>No published lessons yet.</Text>
                </View>
              ) : (
                <>
                  <CourseLearningPath
                    lessons={lessons}
                    currentIndex={pathCurrentIndex === -1 ? 0 : pathCurrentIndex}
                    courseThumbnailUrl={course.thumbnailUrl}
                    onOpenLesson={(lesson) => openLesson(lesson)}
                  />
                  <LessonDurationBackfill
                    lessons={lessons}
                    onDurationSaved={(lessonId, durationSeconds) => {
                      setCourse((prev) => {
                        if (!prev?.lessons) return prev;
                        return {
                          ...prev,
                          lessons: prev.lessons.map((lesson) =>
                            lesson.id === lessonId ? { ...lesson, durationSeconds } : lesson,
                          ),
                        };
                      });
                    }}
                  />
                </>
              )}
            </>
          ) : (
            <>
              <HeroGradient>
                <View style={styles.topBar}>
                  <BackButton fallbackHref="/(tabs)/learn" />
                  <BrandWordmark size="sm" />
                  <View style={styles.topBarSpacer} />
                </View>
                <View style={styles.hero}>
                  <Text style={styles.type}>{COURSE_TYPE_LABELS[course.type] ?? course.type}</Text>
                  <Text style={styles.title}>{course.name}</Text>
                  {course.level?.trim() ? (
                    <Text style={styles.level}>{course.level.trim()}</Text>
                  ) : null}
                  <Text style={styles.meta}>
                    {formatCourseMeta({
                      videoCount: course.videoCount,
                      accessDays: pricing?.accessDays ?? course.accessDays,
                    })}
                  </Text>
                  <View style={styles.priceRow}>
                    <Text style={styles.price}>{formatInr(displayPrice)}</Text>
                    {displayMrp && displayMrp > displayPrice && (
                      <Text style={styles.mrp}>{formatInr(displayMrp)}</Text>
                    )}
                  </View>
                  {pricing?.launchOfferActive && !isRenewalOffer && (
                    <Text style={styles.launch}>
                      {t('offers.launchBanner')}
                    </Text>
                  )}
                  {isRenewalOffer ? (
                    <Text style={styles.launch}>
                      {t('learn.renewCtaWithDiscount', {
                        price: formatInr(displayPrice),
                        percent: renewalPercent,
                      })}
                    </Text>
                  ) : null}
                </View>
              </HeroGradient>

              {banner && (
                <View style={styles.banner}>
                  <Text style={styles.bannerText}>{banner}</Text>
                </View>
              )}

              {course.languages && (
                <View style={styles.block}>
                  <Text style={styles.blockTitle}>Languages</Text>
                  <Text style={styles.body}>{course.languages}</Text>
                </View>
              )}

              <View style={styles.block}>
                <Text style={styles.blockTitle}>{t('learn.whatYouGet')}</Text>
                {whatYouGetLine ? (
                  <Text style={styles.body}>{whatYouGetLine}</Text>
                ) : (
                  <Text style={styles.body}>{t('learn.whatYouGetFallback')}</Text>
                )}
              </View>

              {/* Bundle lessons live on Learn (child courses) — never list them here. */}
              {!isBundle ? (
                <View style={styles.block}>
                  <Text style={styles.blockTitle}>
                    {t('learn.lessons')} ({lessons.length})
                  </Text>
                  {lessons.length === 0 ? (
                    <Text style={styles.body}>No published lessons yet.</Text>
                  ) : (
                    <>
                      {lessons.map((lesson, index) => (
                        <LessonRow
                          key={lesson.id}
                          lesson={lesson}
                          index={index}
                          locked={!lesson.isFreePreview && !hasAccess}
                          onPress={() => openLesson(lesson)}
                          lessonNumberLabel={t('learn.lessonNumber', { number: index + 1 })}
                        />
                      ))}
                      <LessonDurationBackfill
                        lessons={lessons.filter((lesson) => lesson.isFreePreview)}
                        onDurationSaved={(lessonId, durationSeconds) => {
                          setCourse((prev) => {
                            if (!prev?.lessons) return prev;
                            return {
                              ...prev,
                              lessons: prev.lessons.map((lesson) =>
                                lesson.id === lessonId ? { ...lesson, durationSeconds } : lesson,
                              ),
                            };
                          });
                        }}
                      />
                    </>
                  )}
                </View>
              ) : null}
            </>
          )}
        </ScrollView>

        {showPurchaseFooter ? (
          <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
            <Pressable
              style={[styles.unlockBtn, purchasing && styles.btnDisabled]}
              onPress={() => void startPurchase()}
              disabled={purchasing}
            >
              <Text style={styles.unlockBtnText}>{payButtonLabel}</Text>
            </Pressable>
            <Text style={styles.payNote}>
              {isRenewalOffer
                ? t('learn.renewPayNote')
                : 'Payment method: Pay Online. Courses have no delivery.'}
            </Text>
            {!hasLearningProfile && isAuthenticated ? (
              <Pressable
                style={styles.secondaryBtn}
                onPress={() => {
                  setUnlockAutoSendCode(false);
                  setUnlockVisible(true);
                }}
              >
                <Text style={styles.secondaryBtnText}>Save my details first</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <UnlockLearnModal
          visible={unlockVisible}
          courseName={course.name}
          autoSendCode={unlockAutoSendCode}
          onContinue={handleUnlockContinue}
          onSessionExpired={() => {
            setUnlockVisible(false);
            setUnlockAutoSendCode(false);
            setPendingLesson(null);
            setBanner('Please sign in again with your phone number to continue.');
            requireSignIn();
          }}
          onDismiss={() => {
            setUnlockVisible(false);
            setUnlockAutoSendCode(false);
            setPendingLesson(null);
          }}
        />

        <RazorpayCheckoutModal
          visible={checkoutVisible}
          payload={checkoutPayload}
          onSuccess={(result) => void handlePaymentSuccess(result)}
          onDismiss={() => {
            setCheckoutVisible(false);
            setCheckoutPayload(null);
            setPendingOrderId(null);
            setBanner('Payment cancelled. You can try again anytime.');
          }}
          onError={(message) => {
            setCheckoutVisible(false);
            setCheckoutPayload(null);
            setPendingOrderId(null);
            setBanner(message);
            Alert.alert('Payment failed', message);
          }}
        />
      </View>
    </>
  );
}

function LessonRow({
  lesson,
  index,
  locked,
  onPress,
  lessonNumberLabel,
}: {
  lesson: CourseLesson;
  index: number;
  locked: boolean;
  onPress: () => void;
  lessonNumberLabel: string;
}) {
  return (
    <Pressable
      style={[styles.lesson, index === 0 && styles.lessonFirst]}
      onPress={onPress}
    >
      <View style={[styles.lessonIcon, locked && styles.lessonIconLocked]}>
        <Text style={[styles.lessonIconText, locked && styles.lessonIconTextLocked]}>
          {locked ? 'LOCK' : '▶'}
        </Text>
      </View>
      <View style={styles.lessonBody}>
        <Text style={styles.lessonNum}>{lessonNumberLabel}</Text>
        <Text style={styles.lessonTitle}>{lesson.title}</Text>
        <Text style={styles.lessonMeta}>
          {formatDuration(lesson.durationSeconds)}
          {lesson.isFreePreview ? ' · Free preview' : locked ? ' · Purchase to watch' : ''}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: 140,
  },
  contentUnlocked: {
    paddingBottom: spacing.xl,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  topBarSpacer: {
    width: 36,
  },
  unlockedHero: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  unlockedTitle: {
    fontFamily: fonts.heading,
    fontSize: 32,
    lineHeight: 38,
    color: colors.ink,
  },
  hero: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  type: {
    fontFamily: fonts.extraBold,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.pink,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 26,
    color: colors.ink,
    marginTop: 4,
  },
  level: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    marginTop: 4,
  },
  meta: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 8,
  },
  price: {
    fontFamily: fonts.extraBold,
    fontSize: 22,
    color: colors.pink,
  },
  mrp: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.muted,
    textDecorationLine: 'line-through',
  },
  access: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.ink,
    marginTop: 6,
  },
  launch: {
    marginTop: 8,
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.pink,
  },
  accessActive: {
    marginTop: 10,
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.ink,
  },
  expiryReminder: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    backgroundColor: '#fff6e8',
    borderWidth: 1,
    borderColor: colors.softBorder,
    borderRadius: radii.md,
    padding: 14,
    gap: 4,
  },
  expiryReminderEyebrow: {
    fontFamily: fonts.extraBold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.pink,
  },
  expiryReminderText: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 20,
  },
  banner: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    backgroundColor: '#fff3cf',
    borderWidth: 1,
    borderColor: colors.softBorder,
    borderRadius: radii.md,
    padding: 12,
  },
  bannerText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.ink,
    lineHeight: 18,
  },
  block: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.softBorder,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    ...shadows.card,
  },
  blockTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 11,
    color: colors.pink,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1.6,
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 20,
  },
  lesson: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.softBorder,
  },
  lessonFirst: {
    borderTopWidth: 0,
    paddingTop: 2,
  },
  lessonIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.sm,
    backgroundColor: colors.mediaWash,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.softBorder,
  },
  lessonIconLocked: {
    backgroundColor: colors.mediaWash,
    opacity: 0.55,
  },
  lessonIconText: {
    fontFamily: fonts.extraBold,
    fontSize: 14,
    color: colors.pink,
  },
  lessonIconTextLocked: {
    fontSize: 8,
    color: colors.muted,
    letterSpacing: 0.5,
  },
  lessonBody: {
    flex: 1,
  },
  lessonNum: {
    fontFamily: fonts.semiBold,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.pink,
    textTransform: 'uppercase',
  },
  lessonTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.ink,
    marginTop: 2,
  },
  lessonMeta: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopColor: colors.softBorder,
    backgroundColor: colors.white,
    padding: spacing.md,
  },
  unlockBtn: {
    backgroundColor: colors.pink,
    borderRadius: radii.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnDisabled: {
    opacity: 0.65,
  },
  unlockBtnText: {
    fontFamily: fonts.extraBold,
    fontSize: 14,
    color: colors.white,
  },
  payNote: {
    marginTop: 8,
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
    textAlign: 'center',
  },
  secondaryBtn: {
    marginTop: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.muted,
  },
  profileNote: {
    backgroundColor: colors.pinkSoft,
    borderWidth: 1,
    borderColor: colors.softBorder,
    borderRadius: radii.md,
    padding: 14,
  },
  profileNoteText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 17,
  },
});
