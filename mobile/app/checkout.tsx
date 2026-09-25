import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createOrder, quoteDelivery, type DeliveryQuote } from '../src/api/orders';
import { AppImage } from '../src/components/AppImage';
import {
  confirmEmailVerification,
  getMyProfile,
  requestEmailVerification,
  updateMyProfile,
} from '../src/api/me';
import { verifyRazorpayPayment } from '../src/api/payments';
import { ApiClientError } from '../src/api/client';
import { useLearningCustomer, useSession, useShoppingSession } from '../src/auth/SessionContext';
import {
  beginCheckoutAddressEdit,
  consumeCheckoutAddress,
} from '../src/checkout/checkoutAddressDraft';
import { useCart } from '../src/cart/CartContext';
import { lineTotal } from '../src/cart/calculations';
import type { CartLineItem } from '../src/cart/types';
import { BackButton } from '../src/components/BackButton';
import {
  RazorpayCheckoutModal,
  type RazorpayCheckoutPayload,
  type RazorpaySuccessPayload,
} from '../src/components/RazorpayCheckoutModal';
import { EmptyView, LoadingView } from '../src/components/StateViews';
import { useI18n } from '../src/i18n';
import { uiFonts, type UiFonts } from '../src/i18n/uiFonts';
import { colors, spacing } from '../src/theme';
import { formatInr } from '../src/utils/format';
import { formatDeliveryRange } from '../src/utils/orders';
import {
  getShippingAddressError,
  isIndiaAccount,
  isValidEmail,
  isValidName,
  normalizePhone,
  normalizePin,
  normalizePostalCode,
  phoneFromCustomerLoginEmail,
  realCustomerName,
} from '../src/utils/validation';

const FIELD_BORDER = '#eadfe3';
const FIELD_BG = '#fffdfd';
const PANEL_BORDER = '#eadfe3';
const ACCENT_SOFT = '#fff0f4';
const CARD_BG = '#ffffff';
const PAGE_BG = colors.canvas;

function Field({
  label,
  optional,
  style,
  styles,
  ...props
}: TextInputProps & {
  label: string;
  optional?: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  const { t } = useI18n();
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>
        {label}
        {optional ? <Text style={styles.optional}>  {t('checkout.optional')}</Text> : null}
      </Text>
      <TextInput
        {...props}
        style={styles.fieldInput}
        placeholderTextColor="#b5a8ad"
      />
    </View>
  );
}

function Section({
  step,
  title,
  subtitle,
  badge,
  children,
  styles,
}: {
  step?: string;
  title: string;
  subtitle?: string;
  badge?: string;
  children: ReactNode;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        {step ? (
          <View style={styles.stepBadge}>
            <Text style={styles.stepBadgeText}>{step}</Text>
          </View>
        ) : null}
        <View style={styles.sectionTitles}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>{title}</Text>
            {badge ? (
              <View style={styles.sectionPill}>
                <Text style={styles.sectionPillText}>{badge}</Text>
              </View>
            ) : null}
          </View>
          {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function SummaryLine({
  item,
  index,
  styles,
}: {
  item: CartLineItem;
  index: number;
  styles: ReturnType<typeof createStyles>;
}) {
  const { t } = useI18n();
  const fallback = ['#ffe3ec', '#fff0f4', '#ffeaf1', '#ffffff'][index % 4];
  return (
    <View style={styles.summaryLine}>
      <View style={[styles.summaryThumb, !item.imageUrl && { backgroundColor: fallback }]}>
        {item.imageUrl ? (
          <AppImage uri={item.imageUrl} style={styles.summaryThumbImage} contentFit="contain" />
        ) : (
          <Text style={styles.summaryThumbInitial}>{item.name.charAt(0)}</Text>
        )}
      </View>
      <View style={styles.summaryLineBody}>
        <Text style={styles.summaryLineName} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.summaryLineMeta}>{t('checkout.qtyShort', { count: item.quantity })}</Text>
      </View>
      <Text style={styles.summaryLinePrice}>{formatInr(lineTotal(item))}</Text>
    </View>
  );
}

function estimateLabel(quote: DeliveryQuote | null): string {
  if (!quote) return '—';
  const range = formatDeliveryRange(
    quote.estimatedDeliveryDateFrom,
    quote.estimatedDeliveryDateTo,
  );
  if (range) return range.replace('–', ' – ');
  return quote.summary;
}

function isSyntheticEmail(value: string): boolean {
  return value.trim().toLowerCase().endsWith('@vivicrochet.dev');
}

function isUsableCheckoutEmail(value: string): boolean {
  return isValidEmail(value) && !isSyntheticEmail(value);
}

function formatPhoneDisplay(phone: string, addPhoneLabel: string, indiaAccount: boolean): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (!digits) return addPhoneLabel;
  if (indiaAccount) {
    const local = normalizePhone(digits);
    if (local.length !== 10) return local ? `+91 ${local}` : addPhoneLabel;
    return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
  }
  return `+${digits}`;
}

function buildAddressDisplayLines(input: {
  address1: string;
  address2: string;
  landmark: string;
  city: string;
  state: string;
  pinCode: string;
}): string[] {
  const lines: string[] = [];
  const line1 = input.address1.trim();
  if (line1) lines.push(line1);

  const area = [input.address2.trim(), input.landmark.trim()].filter(Boolean).join(', ');
  if (area) lines.push(area);

  const cityState = [input.city.trim(), input.state.trim()].filter(Boolean).join(', ');
  const pin = normalizePin(input.pinCode);
  if (cityState && pin) lines.push(`${cityState} – ${pin}`);
  else if (cityState) lines.push(cityState);
  else if (pin) lines.push(`PIN ${pin}`);

  return lines;
}

function firstNonEmpty(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

export default function CheckoutScreen() {
  const { t, language } = useI18n();
  const fonts = uiFonts(language);
  const styles = useMemo(() => createStyles(fonts), [language]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, user } = useShoppingSession();
  const { isLoading: authLoading } = useSession();
  const { profile: learningProfile, saveProfile } = useLearningCustomer();
  const { items, subtotal, itemCount, isLoading: cartLoading, clearCart } = useCart();

  const [fullName, setFullName] = useState(() =>
    realCustomerName(learningProfile?.fullName, user?.name),
  );
  const [email, setEmail] = useState(learningProfile?.email ?? '');
  const [phone, setPhone] = useState(() =>
    firstNonEmpty(learningProfile?.phone, user?.phone).replace(/\D/g, ''),
  );
  const [address1, setAddress1] = useState('');
  const [address2, setAddress2] = useState('');
  const [landmark, setLandmark] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [saveAddress, setSaveAddress] = useState(true);
  const [indiaAccount, setIndiaAccount] = useState(true);
  const [accountCountry, setAccountCountry] = useState('India');
  const [editingEmail, setEditingEmail] = useState(false);
  const [quote, setQuote] = useState<DeliveryQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [checkoutPayload, setCheckoutPayload] = useState<RazorpayCheckoutPayload | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [confirmingCode, setConfirmingCode] = useState(false);
  const [emailSheetError, setEmailSheetError] = useState<string | null>(null);
  const [emailSheetInfo, setEmailSheetInfo] = useState<string | null>(null);
  const sendCodeInFlight = useRef(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardVisible(true);
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (cartLoading || authLoading) return;
    if (items.length === 0) {
      router.replace('/cart');
    }
  }, [items.length, cartLoading, authLoading, router]);

  const leaveCheckout = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/cart');
  }, [router]);

  const hasEnteredAddressDetails =
    address1.trim().length > 0
    || address2.trim().length > 0
    || landmark.trim().length > 0
    || city.trim().length > 0
    || state.trim().length > 0
    || pinCode.trim().length > 0;

  const allowLeaveRef = useRef(false);
  const navigation = useNavigation();

  const requestLeaveCheckout = useCallback(() => {
    if (allowLeaveRef.current || !hasEnteredAddressDetails) {
      allowLeaveRef.current = true;
      leaveCheckout();
      return;
    }

    Alert.alert(t('checkout.leaveTitle'), t('checkout.leaveBody'), [
      { text: t('checkout.leaveStay'), style: 'cancel' },
      {
        text: t('checkout.leaveConfirm'),
        style: 'destructive',
        onPress: () => {
          allowLeaveRef.current = true;
          leaveCheckout();
        },
      },
    ]);
  }, [hasEnteredAddressDetails, leaveCheckout, t]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        requestLeaveCheckout();
        return true;
      });
      return () => sub.remove();
    }, [requestLeaveCheckout]),
  );

  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (event) => {
      if (allowLeaveRef.current || !hasEnteredAddressDetails) {
        return;
      }
      event.preventDefault();
      Alert.alert(t('checkout.leaveTitle'), t('checkout.leaveBody'), [
        { text: t('checkout.leaveStay'), style: 'cancel' },
        {
          text: t('checkout.leaveConfirm'),
          style: 'destructive',
          onPress: () => {
            allowLeaveRef.current = true;
            navigation.dispatch(event.data.action);
          },
        },
      ]);
    });
    return unsub;
  }, [navigation, hasEnteredAddressDetails, t]);

  useEffect(() => {
    const accountName = realCustomerName(learningProfile?.fullName, user?.name);
    if (accountName) {
      setFullName((current) => realCustomerName(current) || accountName);
    }
    if (learningProfile?.email && isUsableCheckoutEmail(learningProfile.email)) {
      setEmail((current) =>
        isUsableCheckoutEmail(current) ? current : learningProfile.email,
      );
    }
    const accountPhone = firstNonEmpty(
      learningProfile?.phone,
      user?.phone,
      phoneFromCustomerLoginEmail(user?.email),
    );
    if (accountPhone) {
      setPhone((current) => {
        if ((current ?? '').replace(/\D/g, '')) return current;
        return accountPhone;
      });
    }
  }, [learningProfile, user?.name, user?.phone]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    void (async () => {
      try {
        const profile = await getMyProfile();
        if (cancelled) return;
        const india = isIndiaAccount({
          authMethod: profile.authMethod,
          country: profile.country,
        });
        setIndiaAccount(india);
        setAccountCountry(
          india
            ? 'India'
            : (profile.country?.trim() || profile.shippingAddress?.country?.trim() || 'International'),
        );
        const profileEmail = profile.email?.trim() ?? '';
        const profileVerified = Boolean(profile.isEmailVerified) && isUsableCheckoutEmail(profileEmail);
        if (profileVerified) {
          setEmail(profileEmail);
          setVerifiedEmail(profileEmail);
          setIsEmailVerified(true);
          setEditingEmail(false);
        } else if (isUsableCheckoutEmail(profileEmail)) {
          setEmail((current) => (isUsableCheckoutEmail(current) ? current : profileEmail));
          setVerifiedEmail('');
          setIsEmailVerified(false);
          setEditingEmail(false);
        } else {
          setEmail((current) => (isUsableCheckoutEmail(current) ? current : ''));
          setVerifiedEmail('');
          setIsEmailVerified(false);
          setEditingEmail(false);
        }
        setCodeSent(false);
        setVerificationCode('');
        setPhone((current) => {
          const existing = (current ?? '').replace(/\D/g, '');
          if (existing) return current;
          return firstNonEmpty(
            profile.phoneNumber,
            learningProfile?.phone,
            user?.phone,
            phoneFromCustomerLoginEmail(user?.email),
          );
        });

        const saved = profile.shippingAddress;
        setFullName((current) =>
          realCustomerName(current, profile.fullName, user?.name, saved?.fullName),
        );
        if (saved) {
          setSaveAddress(true);
          setPhone((current) => {
            const existing = (current ?? '').replace(/\D/g, '');
            if (existing) return current;
            return saved.phoneNumber || '';
          });
          setAddress1((current) => current.trim() || saved.addressLine1);
          setAddress2((current) => current.trim() || saved.addressLine2 || '');
          setLandmark((current) => current.trim() || saved.landmark || '');
          setCity((current) => current.trim() || saved.city);
          setState((current) => current.trim() || saved.state);
          setPinCode((current) =>
            current.trim()
            || (india ? normalizePin(saved.pinCode) : normalizePostalCode(saved.pinCode)),
          );
        }
      } catch {
        // Prefill is best-effort; checkout still works with manual entry.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.name, user?.phone, user?.email, learningProfile?.phone]);

  const effectivePhone = indiaAccount
    ? normalizePhone(firstNonEmpty(phone, learningProfile?.phone, user?.phone))
    : firstNonEmpty(phone, learningProfile?.phone, user?.phone).replace(/\D/g, '');

  const navigateToAddDeliveryAddress = useCallback(() => {
    beginCheckoutAddressEdit({
      fullName,
      phone: effectivePhone,
      address1,
      address2,
      landmark,
      city,
      state,
      pinCode,
      saveAddress,
    });
    router.push('/add-delivery-address');
  }, [
    address1,
    address2,
    city,
    effectivePhone,
    fullName,
    landmark,
    pinCode,
    router,
    saveAddress,
    state,
  ]);

  useFocusEffect(
    useCallback(() => {
      const draft = consumeCheckoutAddress();
      if (!draft) return;
      try {
        setFullName(draft.fullName ?? '');
        setPhone((draft.phone ?? '').replace(/\D/g, ''));
        setAddress1(draft.address1 ?? '');
        setAddress2(draft.address2 ?? '');
        setLandmark(draft.landmark ?? '');
        setCity(draft.city ?? '');
        setState(draft.state ?? '');
        setPinCode(draft.pinCode ?? '');
        setSaveAddress(Boolean(draft.saveAddress));
      } catch {
        // Ignore malformed drafts — checkout remains usable.
      }
    }, []),
  );

  const shippingAddressError = isAuthenticated
    ? getShippingAddressError({
        fullName,
        phone: effectivePhone,
        address1,
        city,
        state,
        pinCode,
        requireIndianPhone: indiaAccount,
        requireIndianPin: indiaAccount,
      })
    : null;

  const shippingReady = shippingAddressError === null;
  const emailNormalized = email.trim().toLowerCase();
  const emailNeedsVerification =
    isUsableCheckoutEmail(email)
    && (!isEmailVerified || emailNormalized !== verifiedEmail.trim().toLowerCase());
  const emailReady = isUsableCheckoutEmail(email) && !emailNeedsVerification;
  const checkoutReady = shippingReady && emailReady;
  const hasDeliveryAddress = address1.trim().length > 0;

  const addressLines = buildAddressDisplayLines({
    address1,
    address2,
    landmark,
    city,
    state,
    pinCode,
  });
  const phoneDisplay = formatPhoneDisplay(effectivePhone, t('checkout.addPhone'), indiaAccount);
  const emailDisplay = emailReady
    ? email.trim()
    : isUsableCheckoutEmail(email)
      ? t('checkout.verifyEmailContinue')
      : t('checkout.addAndVerifyEmail');

  function onCheckoutEmailChange(value: string) {
    setEmail(value);
    setCodeSent(false);
    setVerificationCode('');
    setEmailSheetError(null);
    if (emailSheetInfo?.startsWith(t('emailVerify.codeSentPrefix'))) setEmailSheetInfo(null);
  }

  async function handleSendEmailCode() {
    if (sendCodeInFlight.current || sendingCode) return;
    const nextEmail = email.trim();
    if (!isUsableCheckoutEmail(nextEmail)) {
      setEmailSheetError(t('checkout.emailValidForUpdates'));
      return;
    }

    sendCodeInFlight.current = true;
    setSendingCode(true);
    setEmailSheetError(null);
    setEmailSheetInfo(null);
    try {
      const response = await requestEmailVerification(nextEmail);
      setCodeSent(true);
      setEmailSheetInfo(response.message || t('checkout.codeSentDefault'));
    } catch (err) {
      setEmailSheetError(
        err instanceof ApiClientError ? err.message : t('checkout.sendCodeFailed'),
      );
    } finally {
      sendCodeInFlight.current = false;
      setSendingCode(false);
    }
  }

  async function handleConfirmCheckoutEmail() {
    const nextEmail = email.trim();
    const code = verificationCode.trim();
    if (!isUsableCheckoutEmail(nextEmail)) {
      setEmailSheetError(t('checkout.emailValidForUpdates'));
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setEmailSheetError(t('validation.otp'));
      return;
    }

    setConfirmingCode(true);
    setEmailSheetError(null);
    setEmailSheetInfo(null);
    try {
      const updated = await confirmEmailVerification({ email: nextEmail, code });
      const saved = isSyntheticEmail(updated.email) ? '' : updated.email.trim();
      setEmail(saved);
      setVerifiedEmail(updated.isEmailVerified ? saved : '');
      setIsEmailVerified(Boolean(updated.isEmailVerified));
      setCodeSent(false);
      setVerificationCode('');
      setEmailSheetInfo(t('checkout.emailVerifiedPayment'));
      await saveProfile({
        fullName: updated.fullName,
        phone: updated.phoneNumber || effectivePhone || learningProfile?.phone || user?.phone || '',
        email: saved,
      });
      setEditingEmail(false);
    } catch (err) {
      setEmailSheetError(
        err instanceof ApiClientError ? err.message : t('emailVerify.verifyEmailFailed'),
      );
    } finally {
      setConfirmingCode(false);
    }
  }

  function buildShippingAddress() {
    return {
      fullName: fullName.trim(),
      phoneNumber: indiaAccount
        ? normalizePhone(effectivePhone)
        : effectivePhone.replace(/\D/g, ''),
      addressLine1: address1.trim(),
      addressLine2: address2.trim() || undefined,
      landmark: landmark.trim() || undefined,
      city: city.trim(),
      state: state.trim(),
      pinCode: indiaAccount ? normalizePin(pinCode) : normalizePostalCode(pinCode).trim(),
      country: indiaAccount ? 'India' : (accountCountry.trim() || 'International'),
    };
  }

  useEffect(() => {
    if (!isAuthenticated || !shippingReady || items.length === 0) {
      setQuote(null);
      return;
    }

    // International orders: no local delivery ETA — notify after confirmation.
    if (!indiaAccount) {
      setQuote(null);
      setQuoteError(null);
      return;
    }

    let cancelled = false;
    const handle = setTimeout(() => {
      void (async () => {
        try {
          const result = await quoteDelivery(
            items.map((item) => ({
              itemType: 'Product' as const,
              productId: item.productId,
              quantity: item.quantity,
            })),
            buildShippingAddress(),
          );
          if (!cancelled) {
            setQuote(result);
            setQuoteError(null);
          }
        } catch (err) {
          if (!cancelled) {
            setQuote(null);
            setQuoteError(err instanceof ApiClientError ? err.message : 'Could not estimate delivery.');
          }
        }
      })();
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [
    isAuthenticated,
    shippingReady,
    indiaAccount,
    items,
    fullName,
    effectivePhone,
    address1,
    address2,
    landmark,
    city,
    state,
    pinCode,
    accountCountry,
  ]);

  async function syncProfileForEmail() {
    if (!isValidName(fullName)) {
      throw new Error('Enter your full name so we can notify you about this order.');
    }
    if (!isUsableCheckoutEmail(email)) {
      throw new Error('Enter a valid email — we will notify you there.');
    }

    const shippingAddress = buildShippingAddress();
    await updateMyProfile({
      fullName: fullName.trim(),
      ...(saveAddress
        ? {
            shippingAddress: {
              fullName: shippingAddress.fullName,
              phoneNumber: shippingAddress.phoneNumber,
              addressLine1: shippingAddress.addressLine1,
              addressLine2: shippingAddress.addressLine2,
              landmark: shippingAddress.landmark,
              city: shippingAddress.city,
              state: shippingAddress.state,
              pinCode: shippingAddress.pinCode,
              country: shippingAddress.country,
            },
          }
        : {}),
    });

    await saveProfile({
      fullName: fullName.trim(),
      phone: effectivePhone || learningProfile?.phone || user?.phone || '',
      email: email.trim().toLowerCase(),
    });
  }

  async function handlePay() {
    if (!isAuthenticated) {
      router.push({ pathname: '/login', params: { returnTo: '/checkout' } });
      return;
    }

    if (!isUsableCheckoutEmail(email)) {
      setEditingEmail(true);
      setStatus(t('checkout.emailValidForUpdates'));
      return;
    }
    if (emailNeedsVerification) {
      setEditingEmail(true);
      setStatus(t('checkout.verifyBeforePayStatus'));
      return;
    }

    const addressError = getShippingAddressError({
      fullName,
      phone: effectivePhone,
      address1,
      city,
      state,
      pinCode,
      requireIndianPhone: indiaAccount,
      requireIndianPin: indiaAccount,
    });
    if (addressError) {
      navigateToAddDeliveryAddress();
      setStatus(addressError);
      Alert.alert(t('checkout.deliveryIncomplete'), addressError);
      return;
    }

    setPurchasing(true);
    setStatus(null);
    try {
      await syncProfileForEmail();

      const shippingAddress = buildShippingAddress();

      const order = await createOrder(
        items.map((item) => ({
          itemType: 'Product' as const,
          productId: item.productId,
          quantity: item.quantity,
        })),
        {
          paymentMethod: 'OnlinePayment',
          shippingAddress,
          saveShippingAddress: saveAddress,
        },
      );

      if (order.delivery) setQuote(order.delivery);

      setPendingOrderId(order.orderId);
      setCheckoutPayload({
        keyId: order.razorpayKeyId,
        orderId: order.razorpayOrderId,
        amountPaise: order.amountPaise,
        currency: order.currency,
        name: 'VIVI Crochet',
        description: `Order ${order.orderNumber}`,
        prefillName: fullName.trim(),
        prefillEmail: email.trim().toLowerCase(),
        prefillContact: effectivePhone || undefined,
      });
      setCheckoutVisible(true);
    } catch (err) {
      const message = err instanceof ApiClientError
        ? err.message
        : err instanceof Error
          ? err.message
          : t('checkout.couldNotStartCheckout');
      setStatus(message);
      Alert.alert(t('checkout.checkoutFailed'), message);
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
      await clearCart();
      router.replace({
        pathname: '/order-confirmation',
        params: { orderId: pendingOrderId },
      });
    } catch (err) {
      const message = err instanceof ApiClientError
        ? err.message
        : t('checkout.paymentConfirmFailed');
      setStatus(message);
      Alert.alert(t('checkout.verificationFailed'), message);
    } finally {
      setPurchasing(false);
      setPendingOrderId(null);
    }
  }

  if (cartLoading || authLoading) {
    return <LoadingView message={t('checkout.preparing')} />;
  }

  if (items.length === 0) {
    return (
      <EmptyView
        title={t('checkout.emptyTitle')}
        message={t('checkout.emptyMessage')}
      />
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: t('headers.checkout'),
          headerLeft: () => (
            <View style={{ marginLeft: 4 }}>
              <BackButton fallbackHref="/cart" onPress={requestLeaveCheckout} />
            </View>
          ),
        }}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>{t('checkout.title')}</Text>
          <Text style={styles.pageSubtitle}>{t('checkout.pageSubtitle')}</Text>
        </View>

        {!isAuthenticated ? (
          <View style={styles.authPanel}>
            <Text style={styles.authTitle}>{t('checkout.almostThere')}</Text>
            <Text style={styles.authBody}>{t('checkout.guestVerifyBody')}</Text>
          </View>
        ) : (
          <>
            <Section
              step="1"
              title={t('checkout.orderUpdates')}
              subtitle={t('checkout.orderUpdatesSub')}
              styles={styles}
            >
              <View style={styles.card}>
                <View style={styles.cardTopRow}>
                  <View style={styles.cardIcon}>
                    <Ionicons name="mail-outline" size={18} color={colors.pink} />
                  </View>
                  <Text style={styles.cardHeading}>{t('checkout.email')}</Text>
                  <Pressable onPress={() => setEditingEmail(true)} hitSlop={8}>
                    <Text style={styles.editLink}>
                      {emailReady ? t('checkout.edit') : t('checkout.add')}
                    </Text>
                  </Pressable>
                </View>
                <Pressable onPress={() => setEditingEmail(true)}>
                  <Text
                    style={[styles.cardValue, !emailReady && styles.cardPlaceholder]}
                    numberOfLines={2}
                  >
                    {emailDisplay}
                  </Text>
                </Pressable>
              </View>
            </Section>

            <Section step="2" title={t('checkout.deliveryTitle')} styles={styles}>
              <View style={styles.cardStack}>
                <View style={styles.card}>
                  <View style={styles.cardTopRow}>
                    <View style={styles.cardIcon}>
                      <Ionicons name="location-outline" size={18} color={colors.pink} />
                    </View>
                    <Text style={styles.cardHeading}>{t('checkout.deliveryAddress')}</Text>
                    <Pressable onPress={navigateToAddDeliveryAddress} hitSlop={8}>
                      <Text style={styles.editLink}>
                        {hasDeliveryAddress ? t('checkout.edit') : t('checkout.add')}
                      </Text>
                    </Pressable>
                  </View>

                  {!hasDeliveryAddress ? (
                    <Pressable onPress={navigateToAddDeliveryAddress}>
                      <Text style={styles.cardMetaPlaceholder}>
                        {t('checkout.addDeliveryHint')}
                      </Text>
                    </Pressable>
                  ) : (
                    <>
                      <Pressable onPress={navigateToAddDeliveryAddress}>
                        <Text style={styles.cardValue}>
                          {fullName || t('checkout.addRecipientName')}
                        </Text>
                        <Text style={styles.cardMeta}>{phoneDisplay}</Text>
                        {addressLines.length > 0 ? (
                          <View style={styles.addressLines}>
                            {addressLines.map((line, index) => (
                              <Text key={`addr-${index}`} style={styles.cardMeta}>
                                {line}
                              </Text>
                            ))}
                          </View>
                        ) : (
                          <Text style={[styles.cardMeta, styles.cardPlaceholder]}>
                            {t('checkout.addressPlaceholder')}
                          </Text>
                        )}
                      </Pressable>
                      <Pressable
                        style={styles.saveRowCompact}
                        onPress={() => setSaveAddress((value) => !value)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: saveAddress }}
                      >
                        <View style={[styles.saveCheck, saveAddress && styles.saveCheckOn]}>
                          {saveAddress ? <Text style={styles.saveCheckMark}>✓</Text> : null}
                        </View>
                        <Text style={styles.saveTitle}>{t('checkout.saveAddress')}</Text>
                      </Pressable>
                    </>
                  )}
                </View>

                <View style={styles.estimateCard}>
                  <Text style={styles.estimateIcon}>🚚</Text>
                  <View style={styles.estimateCopy}>
                    <Text style={styles.estimateLabel}>{t('checkout.estimatedDelivery')}</Text>
                    <Text style={styles.estimateDetail}>
                      {!indiaAccount
                        ? t('checkout.intlDeliveryNotify')
                        : quoteError && !quote
                          ? quoteError
                          : t('checkout.coimbatoreFaster')}
                    </Text>
                  </View>
                  <Text style={styles.estimateRange}>
                    {!indiaAccount
                      ? t('checkout.intlDeliveryRange')
                      : quote
                        ? estimateLabel(quote)
                        : shippingReady
                          ? '…'
                          : '—'}
                  </Text>
                  <Text style={styles.estimateChevron}>›</Text>
                </View>
              </View>
            </Section>

            <Section step="3" title={t('checkout.orderSummary')} styles={styles}>
              <View style={styles.card}>
                {items.map((item, index) => (
                  <SummaryLine key={item.productId} item={item} index={index} styles={styles} />
                ))}
                <View style={styles.breakdown}>
                  <View style={styles.orderSummaryRow}>
                    <Text style={styles.orderSummaryKey}>
                      {t('checkout.itemsCount', { count: itemCount })}
                    </Text>
                    <Text style={styles.orderSummaryVal}>{formatInr(subtotal)}</Text>
                  </View>
                  <View style={styles.orderSummaryRow}>
                    <Text style={styles.orderSummaryKey}>{t('cart.delivery')}</Text>
                    <Text style={styles.orderSummaryMuted}>{t('checkout.deliveryCalcNext')}</Text>
                  </View>
                  <View style={[styles.orderSummaryRow, styles.orderSummaryTotal]}>
                    <Text style={styles.orderSummaryTotalKey}>{t('checkout.totalAmount')}</Text>
                    <Text style={styles.orderSummaryTotalVal}>{formatInr(subtotal)}</Text>
                  </View>
                </View>
              </View>
            </Section>
          </>
        )}

        {status ? (
          <View style={styles.statusBox}>
            <Text style={styles.statusText}>{status}</Text>
          </View>
        ) : null}
      </ScrollView>

      {!keyboardVisible ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.trustBanner}>
            <Text style={styles.trustIcon}>🛡</Text>
            <View style={styles.trustCopy}>
              <Text style={styles.trustTitle}>{t('checkout.secureTitle')}</Text>
              <Text style={styles.trustBody}>{t('checkout.secureBody')}</Text>
            </View>
          </View>
          <Pressable
            style={[styles.proceedBtn, purchasing && styles.btnDisabled]}
            onPress={() => {
              // Open the email sheet only — do not stack Alert.alert on top of it.
              if (isAuthenticated && !isUsableCheckoutEmail(email)) {
                setEditingEmail(true);
                return;
              }
              if (isAuthenticated && emailNeedsVerification) {
                setEditingEmail(true);
                return;
              }
              if (isAuthenticated && !shippingReady) {
                navigateToAddDeliveryAddress();
                return;
              }
              void handlePay();
            }}
            disabled={purchasing}
          >
            <Text style={styles.proceedBtnText}>
              {!isAuthenticated
                ? t('checkout.continueVerifyMobile')
                : purchasing
                  ? t('checkout.startingPayment')
                  : emailNeedsVerification
                    ? t('checkout.verifyEmailToPay')
                    : !checkoutReady
                      ? t('checkout.completeDeliveryToPay')
                      : t('checkout.payOnline')}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <Modal
        visible={editingEmail}
        transparent
        animationType="slide"
        onRequestClose={() => setEditingEmail(false)}
      >
        <KeyboardAvoidingView
          style={[
            styles.sheetRoot,
            {
              // Keep the sheet lower on screen (esp. when keyboard opens with autoFocus).
              paddingTop: insets.top + (keyboardVisible ? 72 : 40),
            },
          ]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.sheetBackdrop} onPress={() => setEditingEmail(false)} />
          <View
            style={[
              styles.sheet,
              {
                marginBottom: Platform.OS === 'android' ? keyboardHeight : 0,
                paddingBottom: Math.max(insets.bottom, 12),
                maxHeight: keyboardVisible ? '72%' : '88%',
              },
            ]}
          >
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {emailReady ? t('checkout.editEmail') : t('checkout.addEmailShort')}
              </Text>
              <Pressable onPress={() => setEditingEmail(false)} hitSlop={8}>
                <Text style={styles.sheetClose}>{t('common.close')}</Text>
              </Pressable>
            </View>
            <ScrollView
              style={styles.sheetScroll}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              automaticallyAdjustKeyboardInsets
              contentContainerStyle={[
                styles.emailSheetContent,
                {
                  paddingBottom: Math.max(insets.bottom, 12) + 48,
                },
              ]}
            >
              <Field
                label={t('checkout.email')}
                value={email}
                onChangeText={onCheckoutEmailChange}
                placeholder="you@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                styles={styles}
              />
              {emailReady ? (
                <Text style={styles.emailVerifiedHint}>{t('checkout.verifiedHint')}</Text>
              ) : (
                <Text style={styles.emailVerifyHint}>{t('checkout.verifyEmailPayBody')}</Text>
              )}
              {emailSheetError ? (
                <Text style={styles.emailSheetError}>{emailSheetError}</Text>
              ) : null}
              {emailSheetInfo ? (
                <Text style={styles.emailSheetInfo}>{emailSheetInfo}</Text>
              ) : null}
              {emailNeedsVerification ? (
                <>
                  <Pressable
                    style={[
                      styles.emailCodeBtn,
                      (sendingCode || confirmingCode) && styles.btnDisabled,
                    ]}
                    onPress={() => void handleSendEmailCode()}
                    disabled={sendingCode || confirmingCode}
                  >
                    <Text style={styles.emailCodeBtnText}>
                      {sendingCode
                        ? t('emailVerify.sendingCode')
                        : codeSent
                          ? t('emailVerify.resendCode')
                          : t('checkout.sendVerificationCode')}
                    </Text>
                  </Pressable>
                  {codeSent ? (
                    <>
                      <Field
                        label={t('checkout.verificationCode')}
                        value={verificationCode}
                        onChangeText={setVerificationCode}
                        placeholder={t('auth.sixDigit')}
                        keyboardType="number-pad"
                        maxLength={6}
                        styles={styles}
                      />
                      <Pressable
                        style={[
                          styles.sheetSaveBtn,
                          confirmingCode && styles.btnDisabled,
                        ]}
                        onPress={() => void handleConfirmCheckoutEmail()}
                        disabled={confirmingCode}
                      >
                        <Text style={styles.sheetSaveBtnText}>
                          {confirmingCode ? t('emailVerify.verifying') : t('checkout.confirmEmail')}
                        </Text>
                      </Pressable>
                    </>
                  ) : null}
                </>
              ) : (
                <Pressable
                  style={styles.sheetSaveBtn}
                  onPress={() => setEditingEmail(false)}
                >
                  <Text style={styles.sheetSaveBtnText}>{t('common.done')}</Text>
                </Pressable>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <RazorpayCheckoutModal
        visible={checkoutVisible}
        payload={checkoutPayload}
        onSuccess={(result) => void handlePaymentSuccess(result)}
        onDismiss={() => {
          setCheckoutVisible(false);
          setCheckoutPayload(null);
          setPendingOrderId(null);
          setStatus(t('checkout.paymentCancelled'));
        }}
        onError={(message) => {
          setCheckoutVisible(false);
          setCheckoutPayload(null);
          setPendingOrderId(null);
          setStatus(message);
          Alert.alert(t('checkout.paymentFailed'), message);
        }}
      />
    </View>
  );
}

function createStyles(fonts: UiFonts) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },
  scroll: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  pageHeader: {
    marginBottom: spacing.lg,
    paddingTop: 4,
    alignItems: 'center',
  },
  pageTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 28,
    color: colors.ink,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  pageSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.muted,
    marginTop: 6,
    lineHeight: 20,
    textAlign: 'center',
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 10,
  },
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepBadgeText: {
    fontFamily: fonts.extraBold,
    fontSize: 12,
    color: colors.white,
  },
  sectionTitles: {
    flex: 1,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  sectionTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 17,
    color: colors.ink,
    letterSpacing: -0.2,
  },
  sectionPill: {
    backgroundColor: ACCENT_SOFT,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  sectionPillText: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.pink,
  },
  sectionSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    marginTop: 3,
    lineHeight: 17,
  },
  sectionBody: {
    gap: 10,
  },
  cardStack: {
    gap: 10,
  },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PANEL_BORDER,
    padding: 14,
    gap: 10,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: CARD_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PANEL_BORDER,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: ACCENT_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIconGlyph: {
    fontSize: 15,
    color: colors.ink,
  },
  cardBody: {
    flex: 1,
    gap: 2,
  },
  cardEyebrow: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
  },
  cardHeading: {
    flex: 1,
    fontFamily: fonts.extraBold,
    fontSize: 14,
    color: colors.ink,
  },
  cardValue: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.ink,
  },
  cardMeta: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.ink,
    lineHeight: 18,
    marginTop: 2,
  },
  addressLines: {
    marginTop: 2,
    gap: 2,
  },
  cardPlaceholder: {
    color: colors.muted,
  },
  editLink: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.pink,
  },
  cardMetaPlaceholder: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },
  estimateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: CARD_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PANEL_BORDER,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  estimateIcon: {
    fontSize: 18,
  },
  estimateCopy: {
    flex: 1,
  },
  estimateLabel: {
    fontFamily: fonts.extraBold,
    fontSize: 14,
    color: colors.ink,
  },
  estimateDetail: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
    lineHeight: 17,
  },
  estimateRange: {
    fontFamily: fonts.extraBold,
    fontSize: 13,
    color: colors.ink,
  },
  estimateChevron: {
    fontFamily: fonts.semiBold,
    fontSize: 18,
    color: colors.muted,
    marginLeft: 2,
  },
  summaryLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  summaryThumb: {
    width: 52,
    height: 52,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.mediaWash,
  },
  summaryThumbImage: {
    width: '100%',
    height: '100%',
  },
  summaryThumbInitial: {
    fontFamily: fonts.extraBold,
    fontSize: 18,
    color: colors.ink,
    opacity: 0.22,
  },
  summaryLineBody: {
    flex: 1,
  },
  summaryLineName: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 18,
  },
  summaryLineMeta: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    marginTop: 3,
  },
  summaryLinePrice: {
    fontFamily: fonts.extraBold,
    fontSize: 14,
    color: colors.ink,
  },
  breakdown: {
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: PANEL_BORDER,
    gap: 10,
  },
  orderSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  orderSummaryKey: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.ink,
  },
  orderSummaryVal: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.ink,
  },
  orderSummaryMuted: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
  },
  orderSummaryTotal: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: PANEL_BORDER,
    paddingTop: 10,
    marginTop: 2,
  },
  orderSummaryTotalKey: {
    fontFamily: fonts.extraBold,
    fontSize: 14,
    color: colors.ink,
  },
  orderSummaryTotalVal: {
    fontFamily: fonts.extraBold,
    fontSize: 16,
    color: colors.ink,
  },
  inlineDone: {
    alignSelf: 'flex-start',
    backgroundColor: colors.pink,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 4,
  },
  inlineDoneText: {
    fontFamily: fonts.extraBold,
    fontSize: 13,
    color: colors.white,
  },
  field: {
    gap: 6,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 10,
  },
  fieldHalf: {
    flex: 1,
  },
  fieldLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  optional: {
    fontFamily: fonts.regular,
    fontSize: 10,
    letterSpacing: 0,
    textTransform: 'none',
    color: '#b5a8ad',
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: FIELD_BORDER,
    backgroundColor: FIELD_BG,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.ink,
  },
  saveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
    paddingTop: 4,
  },
  saveRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  saveCheck: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.softBorder,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveCheckOn: {
    backgroundColor: colors.pink,
    borderColor: colors.pink,
  },
  saveCheckMark: {
    fontFamily: fonts.extraBold,
    fontSize: 12,
    color: colors.white,
    lineHeight: 14,
  },
  saveTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.ink,
    flex: 1,
  },
  fieldHint: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.pinkDark,
    lineHeight: 17,
  },
  authPanel: {
    marginBottom: spacing.lg,
    padding: 18,
    borderRadius: 18,
    backgroundColor: ACCENT_SOFT,
    borderWidth: 1,
    borderColor: '#f5d0db',
  },
  authTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 16,
    color: colors.ink,
  },
  authBody: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    marginTop: 8,
    lineHeight: 19,
  },
  statusBox: {
    marginBottom: spacing.md,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.pinkMist,
    borderWidth: 1,
    borderColor: colors.softBorder,
  },
  statusText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.ink,
    lineHeight: 18,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: PANEL_BORDER,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingTop: 12,
    gap: 12,
  },
  trustBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: ACCENT_SOFT,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  trustIcon: {
    fontSize: 18,
  },
  trustCopy: {
    flex: 1,
  },
  trustTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 13,
    color: colors.ink,
  },
  trustBody: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
    lineHeight: 16,
  },
  proceedBtn: {
    backgroundColor: colors.pink,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnDisabled: {
    opacity: 0.65,
  },
  proceedBtnText: {
    fontFamily: fonts.extraBold,
    fontSize: 15,
    color: colors.white,
    letterSpacing: 0.2,
  },
  sheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(34, 26, 30, 0.45)',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '88%',
    paddingHorizontal: spacing.md,
    paddingTop: 10,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#e2dce0',
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sheetTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 18,
    color: colors.ink,
    letterSpacing: -0.2,
    flex: 1,
    paddingRight: 12,
  },
  sheetClose: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.muted,
  },
  sheetScroll: {
    flexGrow: 0,
  },
  emailSheetContent: {
    gap: 12,
    flexGrow: 1,
  },
  emailVerifyHint: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
    marginBottom: 4,
  },
  emailVerifiedHint: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.success,
  },
  emailSheetError: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.danger,
    lineHeight: 18,
  },
  emailSheetInfo: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.ink,
    lineHeight: 18,
  },
  emailCodeBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: colors.pink,
    marginTop: spacing.sm,
  },
  emailCodeBtnText: {
    fontFamily: fonts.extraBold,
    fontSize: 14,
    color: colors.white,
  },
  sheetSaveBtn: {
    backgroundColor: colors.pink,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  sheetSaveBtnText: {
    fontFamily: fonts.extraBold,
    fontSize: 15,
    color: colors.white,
  },
  });
}
