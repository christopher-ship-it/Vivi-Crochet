import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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
import { getCoursePricing, getMyEnrollment, type CoursePricing, type Enrollment } from '../../src/api/enrollments';
import { createOrder } from '../../src/api/orders';
import { updateMyProfile } from '../../src/api/me';
import { verifyRazorpayPayment } from '../../src/api/payments';
import { ApiClientError } from '../../src/api/client';
import { useLearningCustomer, useShoppingSession } from '../../src/auth/SessionContext';
import { isValidEmail, isValidName } from '../../src/utils/validation';
import {
  RazorpayCheckoutModal,
  type RazorpayCheckoutPayload,
  type RazorpaySuccessPayload,
} from '../../src/components/RazorpayCheckoutModal';
import { UnlockLearnModal } from '../../src/components/UnlockLearnModal';
import { ErrorView, LoadingView } from '../../src/components/StateViews';
import type { Course, CourseLesson } from '../../src/types';
import { colors, fonts, radii, shadows, spacing } from '../../src/theme';
import {
  COURSE_TYPE_LABELS,
  formatAccessDays,
  formatCourseMeta,
  formatDuration,
  formatInr,
} from '../../src/utils/format';

export default function CourseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, user } = useShoppingSession();
  const { profile: learningProfile } = useLearningCustomer();
  const [course, setCourse] = useState<Course | null>(null);
  const [pricing, setPricing] = useState<CoursePricing | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unlockVisible, setUnlockVisible] = useState(false);
  const [pendingLesson, setPendingLesson] = useState<CourseLesson | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [checkoutPayload, setCheckoutPayload] = useState<RazorpayCheckoutPayload | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const hasLearningProfile = Boolean(learningProfile);
  const hasAccess = Boolean(enrollment?.isActive);

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
        try {
          setEnrollment(await getMyEnrollment(id));
        } catch (err) {
          if (err instanceof ApiClientError && err.status === 404) {
            setEnrollment(null);
          } else {
            setEnrollment(null);
          }
        }
      } else {
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

  function openLesson(lesson: CourseLesson) {
    if (lesson.isFreePreview || hasAccess) {
      router.push({
        pathname: '/lesson/[id]',
        params: { id: lesson.id, courseName: course?.name ?? '', courseId: course?.id ?? id ?? '' },
      });
      return;
    }

    if (!hasLearningProfile) {
      setPendingLesson(lesson);
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
    }
  }

  async function startPurchase() {
    if (!course || !id) return;

    if (!isAuthenticated) {
      router.push({
        pathname: '/login',
        params: { returnTo: `/course/${id}` },
      });
      return;
    }

    const name = learningProfile?.fullName?.trim() ?? '';
    const email = learningProfile?.email?.trim() ?? '';
    if (!isValidName(name) || !isValidEmail(email)) {
      setPendingLesson(null);
      setUnlockVisible(true);
      setBanner('Add your name and email so we can notify you about your order.');
      return;
    }

    setPurchasing(true);
    setBanner(null);
    setError(null);
    try {
      await updateMyProfile({
        fullName: name,
        email: email.toLowerCase(),
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
        prefillEmail: email.toLowerCase(),
        prefillContact: learningProfile?.phone ?? user?.phone ?? undefined,
      });
      setCheckoutVisible(true);
    } catch (err) {
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

  if (loading) return <LoadingView message="Loading course…" />;
  if (error || !course) {
    return <ErrorView message={error ?? 'Course not found.'} onRetry={load} />;
  }

  const lessons = (course.lessons ?? [])
    .filter((lesson) => lesson.status === 'Published')
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const displayPrice = pricing?.applicablePrice ?? course.price;
  const displayMrp = pricing?.mrp ?? course.mrp;

  return (
    <>
      <Stack.Screen options={{ title: course.name }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.type}>{COURSE_TYPE_LABELS[course.type] ?? course.type}</Text>
          <Text style={styles.title}>{course.name}</Text>
          {course.level && <Text style={styles.level}>{course.level}</Text>}
          <Text style={styles.meta}>{formatCourseMeta(course)}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatInr(displayPrice)}</Text>
            {displayMrp && displayMrp > displayPrice && (
              <Text style={styles.mrp}>{formatInr(displayMrp)}</Text>
            )}
          </View>
          <Text style={styles.access}>{formatAccessDays(pricing?.accessDays ?? course.accessDays)}</Text>
          {pricing?.launchOfferActive && (
            <Text style={styles.launch}>
              Launch offer · {pricing.launchOfferRemaining ?? 0} left at this price
            </Text>
          )}
          {hasAccess && enrollment && (
            <Text style={styles.accessActive}>
              Access active until {new Date(enrollment.accessExpiryDate).toLocaleDateString('en-IN')}
            </Text>
          )}
        </View>

        {banner && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>{banner}</Text>
          </View>
        )}

        {course.about && (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>About this class</Text>
            <Text style={styles.body}>{course.about}</Text>
          </View>
        )}

        {course.languages && (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Languages</Text>
            <Text style={styles.body}>{course.languages}</Text>
          </View>
        )}

        <View style={styles.block}>
          <Text style={styles.blockTitle}>What you get</Text>
          <Text style={styles.body}>
            {course.videoCount} guided video lesson{course.videoCount === 1 ? '' : 's'} with{' '}
            {formatAccessDays(pricing?.accessDays ?? course.accessDays).toLowerCase()} after purchase.
          </Text>
        </View>

        <View style={styles.block}>
          <Text style={styles.blockTitle}>Lessons ({lessons.length})</Text>
          {lessons.length === 0 ? (
            <Text style={styles.body}>No published lessons yet.</Text>
          ) : (
            lessons.map((lesson, index) => (
              <LessonRow
                key={lesson.id}
                lesson={lesson}
                index={index}
                locked={!lesson.isFreePreview && !hasAccess}
                onPress={() => openLesson(lesson)}
              />
            ))
          )}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
        {hasAccess ? (
          <View style={styles.profileNote}>
            <Text style={styles.profileNoteText}>
              You have access. Open any lesson above to start watching.
            </Text>
          </View>
        ) : (
          <>
            <Pressable
              style={[styles.unlockBtn, purchasing && styles.btnDisabled]}
              onPress={() => void startPurchase()}
              disabled={purchasing}
            >
              <Text style={styles.unlockBtnText}>
                {purchasing
                  ? 'Starting checkout…'
                  : `Pay Online · ${formatInr(displayPrice)}`}
              </Text>
            </Pressable>
            <Text style={styles.payNote}>Payment method: Pay Online. Courses have no delivery.</Text>
            {!hasLearningProfile && (
              <Pressable style={styles.secondaryBtn} onPress={() => setUnlockVisible(true)}>
                <Text style={styles.secondaryBtnText}>Save my details first</Text>
              </Pressable>
            )}
          </>
        )}
      </View>

      <UnlockLearnModal
        visible={unlockVisible}
        courseName={course.name}
        onContinue={handleUnlockContinue}
        onDismiss={() => {
          setUnlockVisible(false);
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
    </>
  );
}

function LessonRow({
  lesson,
  index,
  locked,
  onPress,
}: {
  lesson: CourseLesson;
  index: number;
  locked: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.lesson} onPress={onPress}>
      <View style={[styles.lessonIcon, locked && styles.lessonIconLocked]}>
        <Text style={[styles.lessonIconText, locked && styles.lessonIconTextLocked]}>
          {locked ? 'LOCK' : '▶'}
        </Text>
      </View>
      <View style={styles.lessonBody}>
        <Text style={styles.lessonNum}>Lesson {index + 1}</Text>
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
    backgroundColor: colors.cream,
  },
  content: {
    paddingBottom: 140,
  },
  hero: {
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.softBorder,
    backgroundColor: colors.white,
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
    marginTop: 6,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 10,
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
  banner: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    backgroundColor: '#fff3cf',
    borderWidth: 1,
    borderColor: colors.softBorder,
    borderRadius: radii.md,
    padding: 14,
  },
  bannerText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.ink,
    lineHeight: 18,
  },
  block: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.softBorder,
    padding: spacing.lg,
    ...shadows.card,
  },
  blockTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 11,
    color: colors.pink,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.6,
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 21,
  },
  lesson: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.softBorder,
  },
  lessonIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.sm,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.softBorder,
  },
  lessonIconLocked: {
    backgroundColor: colors.canvas,
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
