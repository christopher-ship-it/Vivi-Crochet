import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
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
import { getMyProfile, updateMyProfile } from '../src/api/me';
import { verifyRazorpayPayment } from '../src/api/payments';
import { ApiClientError } from '../src/api/client';
import { useLearningCustomer, useSession, useShoppingSession } from '../src/auth/SessionContext';
import { useCart } from '../src/cart/CartContext';
import { lineTotal } from '../src/cart/calculations';
import type { CartLineItem } from '../src/cart/types';
import {
  RazorpayCheckoutModal,
  type RazorpayCheckoutPayload,
  type RazorpaySuccessPayload,
} from '../src/components/RazorpayCheckoutModal';
import { EmptyView, LoadingView } from '../src/components/StateViews';
import { colors, fonts, spacing } from '../src/theme';
import { formatInr } from '../src/utils/format';
import { isValidEmail, isValidName, normalizePhone, normalizePin, getShippingAddressError } from '../src/utils/validation';

const FIELD_BORDER = '#eadfe3';
const FIELD_BG = '#fffdfd';
const PANEL_BORDER = '#eadfe3';
const ACCENT_SOFT = '#fff0f4';

function Field({
  label,
  optional,
  style,
  ...props
}: TextInputProps & { label: string; optional?: boolean }) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>
        {label}
        {optional ? <Text style={styles.optional}>  optional</Text> : null}
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
  children,
}: {
  step?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
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
          <Text style={styles.sectionTitle}>{title}</Text>
          {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      <View style={styles.panel}>{children}</View>
    </View>
  );
}

function BagLine({ item, index, isLast }: { item: CartLineItem; index: number; isLast: boolean }) {
  const fallback = ['#ffe3ec', '#fff0f4', '#ffeaf1', '#ffffff'][index % 4];
  return (
    <View style={[styles.bagLine, !isLast && styles.bagLineBorder]}>
      <View style={[styles.bagThumb, !item.imageUrl && { backgroundColor: fallback }]}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.bagThumbImage} resizeMode="contain" />
        ) : (
          <Text style={styles.bagThumbInitial}>{item.name.charAt(0)}</Text>
        )}
      </View>
      <View style={styles.bagBody}>
        <Text style={styles.bagName} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.bagMeta}>Qty {item.quantity}</Text>
      </View>
      <Text style={styles.bagPrice}>{formatInr(lineTotal(item))}</Text>
    </View>
  );
}

function firstNonEmpty(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

export default function CheckoutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, user } = useShoppingSession();
  const { isLoading: authLoading } = useSession();
  const { profile: learningProfile, saveProfile } = useLearningCustomer();
  const { items, subtotal, itemCount, isLoading: cartLoading, clearCart } = useCart();

  const [fullName, setFullName] = useState(() =>
    firstNonEmpty(learningProfile?.fullName, user?.name),
  );
  const [email, setEmail] = useState(learningProfile?.email ?? '');
  const [phone, setPhone] = useState(() =>
    normalizePhone(firstNonEmpty(learningProfile?.phone, user?.phone)),
  );
  const [address1, setAddress1] = useState('');
  const [address2, setAddress2] = useState('');
  const [landmark, setLandmark] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [saveAddress, setSaveAddress] = useState(true);
  const [hasSavedAddress, setHasSavedAddress] = useState(false);
  const [quote, setQuote] = useState<DeliveryQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [checkoutPayload, setCheckoutPayload] = useState<RazorpayCheckoutPayload | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (cartLoading || authLoading) return;
    if (items.length === 0) {
      router.replace('/cart');
    }
  }, [items.length, cartLoading, authLoading, router]);

  useEffect(() => {
    const accountName = firstNonEmpty(learningProfile?.fullName, user?.name);
    if (accountName) {
      setFullName((current) => current.trim() || accountName);
    }
    if (learningProfile?.email) {
      setEmail((current) => current.trim() || learningProfile.email);
    }
    const accountPhone = normalizePhone(firstNonEmpty(learningProfile?.phone, user?.phone));
    if (accountPhone) {
      setPhone((current) => normalizePhone(current) || accountPhone);
    }
  }, [learningProfile, user?.name, user?.phone]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    void (async () => {
      try {
        const profile = await getMyProfile();
        if (cancelled) return;
        setFullName((current) => current.trim() || firstNonEmpty(profile.fullName, user?.name));
        setEmail((current) => current.trim() || profile.email);
        setPhone((current) => normalizePhone(current) || normalizePhone(profile.phoneNumber));

        const saved = profile.shippingAddress;
        if (saved) {
          setHasSavedAddress(true);
          setFullName((current) => current.trim() || saved.fullName);
          setPhone((current) => normalizePhone(current) || normalizePhone(saved.phoneNumber));
          setAddress1((current) => current.trim() || saved.addressLine1);
          setAddress2((current) => current.trim() || saved.addressLine2 || '');
          setLandmark((current) => current.trim() || saved.landmark || '');
          setCity((current) => current.trim() || saved.city);
          setState((current) => current.trim() || saved.state);
          setPinCode((current) => normalizePin(current) || normalizePin(saved.pinCode));
        }
      } catch {
        // Prefill is best-effort; checkout still works with manual entry.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.name]);

  const effectivePhone = normalizePhone(
    firstNonEmpty(phone, learningProfile?.phone, user?.phone),
  );

  const shippingAddressError = isAuthenticated
    ? getShippingAddressError({
        fullName,
        phone: effectivePhone,
        address1,
        city,
        state,
        pinCode,
      })
    : null;

  const shippingReady = shippingAddressError === null;

  function buildShippingAddress() {
    return {
      fullName: fullName.trim(),
      phoneNumber: normalizePhone(effectivePhone),
      addressLine1: address1.trim(),
      addressLine2: address2.trim() || undefined,
      landmark: landmark.trim() || undefined,
      city: city.trim(),
      state: state.trim(),
      pinCode: normalizePin(pinCode),
      country: 'India' as const,
    };
  }

  useEffect(() => {
    if (!isAuthenticated || !shippingReady || items.length === 0) {
      setQuote(null);
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
    items,
    fullName,
    effectivePhone,
    address1,
    address2,
    landmark,
    city,
    state,
    pinCode,
  ]);

  async function syncProfileForEmail() {
    if (!isValidName(fullName)) {
      throw new Error('Enter your full name so we can notify you about this order.');
    }
    if (!isValidEmail(email)) {
      throw new Error('Enter a valid email — we will notify you there.');
    }

    const shippingAddress = buildShippingAddress();
    await updateMyProfile({
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
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

    const addressError = getShippingAddressError({
      fullName,
      phone: effectivePhone,
      address1,
      city,
      state,
      pinCode,
    });
    if (addressError) {
      setStatus(addressError);
      Alert.alert('Delivery details incomplete', addressError);
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
          : 'Could not start checkout.';
      setStatus(message);
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
      await clearCart();
      router.replace({
        pathname: '/order-confirmation',
        params: { orderId: pendingOrderId },
      });
    } catch (err) {
      const message = err instanceof ApiClientError
        ? err.message
        : 'Payment received but confirmation failed. Contact support with your payment details.';
      setStatus(message);
      Alert.alert('Verification failed', message);
    } finally {
      setPurchasing(false);
      setPendingOrderId(null);
    }
  }

  if (cartLoading || authLoading) {
    return <LoadingView message="Preparing checkout…" />;
  }

  if (items.length === 0) {
    return (
      <EmptyView
        title="Nothing to checkout"
        message="Your cart is empty. Add products from the shop first."
      />
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>CHECKOUT</Text>
          <Text style={styles.title}>Order summary</Text>
          <Text style={styles.meta}>
            {itemCount} handmade piece{itemCount === 1 ? '' : 's'} · booked into production after payment
          </Text>
        </View>

        <Section title="Your bag" subtitle="Review what you’re booking">
          {items.map((item, index) => (
            <BagLine
              key={item.productId}
              item={item}
              index={index}
              isLast={index === items.length - 1}
            />
          ))}
          <View style={styles.totalStrip}>
            <View>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalHint}>Taxes & delivery noted after address</Text>
            </View>
            <Text style={styles.totalValue}>{formatInr(subtotal)}</Text>
          </View>
        </Section>

        {isAuthenticated ? (
          <Section
            step="1"
            title="Order updates"
            subtitle="We’ll email your booking confirmation here"
          >
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Section>
        ) : (
          <View style={styles.authPanel}>
            <Text style={styles.authTitle}>Almost there</Text>
            <Text style={styles.authBody}>
              Verify your mobile number to place the order. You’ll be notified once payment is done.
            </Text>
          </View>
        )}

        {isAuthenticated && (
          <Section
            step="2"
            title="Delivery"
            subtitle={
              hasSavedAddress
                ? 'Using your saved address. Edit if needed.'
                : 'We ship across India · Coimbatore arrives faster'
            }
          >
            <Field
              label="Recipient name"
              value={fullName}
              onChangeText={setFullName}
              placeholder="Full name"
              autoCapitalize="words"
            />
            <Field
              label="Phone"
              value={phone}
              onChangeText={(value) => setPhone(normalizePhone(value))}
              placeholder="10-digit mobile"
              keyboardType="phone-pad"
              maxLength={10}
            />
            <Field
              label="Address line 1"
              value={address1}
              onChangeText={setAddress1}
              placeholder="House / street"
            />
            <Field
              label="Address line 2"
              optional
              value={address2}
              onChangeText={setAddress2}
              placeholder="Apartment, floor"
            />
            <Field
              label="Landmark"
              optional
              value={landmark}
              onChangeText={setLandmark}
              placeholder="Near…"
            />
            <View style={styles.fieldRow}>
              <Field
                label="City"
                style={styles.fieldHalf}
                value={city}
                onChangeText={setCity}
                placeholder="Coimbatore"
                autoCapitalize="words"
              />
              <Field
                label="PIN"
                style={styles.fieldHalf}
                value={pinCode}
                onChangeText={(value) => setPinCode(normalizePin(value))}
                placeholder="641001"
                keyboardType="number-pad"
                maxLength={6}
              />
            </View>
            <Field
              label="State"
              value={state}
              onChangeText={setState}
              placeholder="Tamil Nadu"
              autoCapitalize="words"
            />
            <View style={styles.countryPill}>
              <Text style={styles.countryPillText}>India</Text>
            </View>
            <Pressable
              style={styles.saveRow}
              onPress={() => setSaveAddress((value) => !value)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: saveAddress }}
            >
              <View style={[styles.saveCheck, saveAddress && styles.saveCheckOn]}>
                {saveAddress ? <Text style={styles.saveCheckMark}>✓</Text> : null}
              </View>
              <View style={styles.saveCopy}>
                <Text style={styles.saveTitle}>Save this address</Text>
                <Text style={styles.saveHint}>Prefill it automatically next time you checkout</Text>
              </View>
            </Pressable>
            {shippingAddressError ? (
              <Text style={styles.fieldHint}>{shippingAddressError}</Text>
            ) : null}
          </Section>
        )}

        {isAuthenticated && (
          <Section step="3" title="Payment" subtitle="Secure checkout via Razorpay">
            <View style={styles.payMethod}>
              <View style={styles.payMethodLeft}>
                <View style={styles.radioOuter}>
                  <View style={styles.radioInner} />
                </View>
                <View>
                  <Text style={styles.payLabel}>Pay online</Text>
                  <Text style={styles.payMeta}>Cards · UPI · Net banking</Text>
                </View>
              </View>
              <View style={styles.paySelected}>
                <Text style={styles.paySelectedText}>Selected</Text>
              </View>
            </View>
          </Section>
        )}

        {quote ? (
          <View style={styles.estimateBanner}>
            <Text style={styles.estimateEyebrow}>DELIVERY WINDOW</Text>
            <Text style={styles.estimateTitle}>{quote.locationLabel}</Text>
            <Text style={styles.estimateValue}>{quote.summary}</Text>
          </View>
        ) : null}
        {quoteError && !quote ? (
          <View style={styles.statusBox}>
            <Text style={styles.statusText}>{quoteError}</Text>
          </View>
        ) : null}

        {status ? (
          <View style={styles.statusBox}>
            <Text style={styles.statusText}>{status}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.footerTop}>
          <Text style={styles.footerAmountLabel}>Amount due</Text>
          <Text style={styles.footerAmount}>{formatInr(subtotal)}</Text>
        </View>
        <Pressable
          style={[styles.proceedBtn, purchasing && styles.btnDisabled]}
          onPress={() => void handlePay()}
          disabled={purchasing}
        >
          <Text style={styles.proceedBtnText}>
            {!isAuthenticated
              ? 'Continue · Verify mobile'
              : purchasing
                ? 'Starting payment…'
                : !shippingReady
                  ? 'Complete delivery to pay'
                  : 'Pay online'}
          </Text>
        </Pressable>
      </View>

      <RazorpayCheckoutModal
        visible={checkoutVisible}
        payload={checkoutPayload}
        onSuccess={(result) => void handlePaymentSuccess(result)}
        onDismiss={() => {
          setCheckoutVisible(false);
          setCheckoutPayload(null);
          setPendingOrderId(null);
          setStatus('Payment cancelled. Your cart is still saved.');
        }}
        onError={(message) => {
          setCheckoutVisible(false);
          setCheckoutPayload(null);
          setPendingOrderId(null);
          setStatus(message);
          Alert.alert('Payment failed', message);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  scroll: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  hero: {
    marginBottom: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PANEL_BORDER,
  },
  eyebrow: {
    fontFamily: fonts.extraBold,
    fontSize: 10,
    letterSpacing: 2.4,
    color: colors.pink,
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 28,
    color: colors.ink,
    marginTop: 6,
    letterSpacing: -0.4,
  },
  meta: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    marginTop: 8,
    lineHeight: 19,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
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
  sectionTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 17,
    color: colors.ink,
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    marginTop: 3,
    lineHeight: 17,
  },
  panel: {
    backgroundColor: colors.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: PANEL_BORDER,
    padding: 16,
    gap: 12,
  },
  bagLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 12,
  },
  bagLineBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PANEL_BORDER,
    marginBottom: 4,
  },
  bagThumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.canvas,
  },
  bagThumbImage: {
    width: '100%',
    height: '100%',
  },
  bagThumbInitial: {
    fontFamily: fonts.extraBold,
    fontSize: 20,
    color: colors.ink,
    opacity: 0.22,
  },
  bagBody: {
    flex: 1,
  },
  bagName: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 18,
  },
  bagMeta: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    marginTop: 3,
  },
  bagPrice: {
    fontFamily: fonts.extraBold,
    fontSize: 14,
    color: colors.ink,
  },
  totalStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: PANEL_BORDER,
  },
  totalLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.ink,
  },
  totalHint: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  totalValue: {
    fontFamily: fonts.extraBold,
    fontSize: 22,
    color: colors.pink,
    letterSpacing: -0.3,
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
  countryPill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.canvas,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  countryPillText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.muted,
  },
  saveRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 4,
    paddingTop: 4,
  },
  saveCheck: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.softBorder,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
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
  saveCopy: {
    flex: 1,
  },
  saveTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.ink,
  },
  saveHint: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
    lineHeight: 17,
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
  payMethod: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: ACCENT_SOFT,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#f5d0db',
  },
  payMethodLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.pink,
  },
  payLabel: {
    fontFamily: fonts.extraBold,
    fontSize: 15,
    color: colors.ink,
  },
  payMeta: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  paySelected: {
    backgroundColor: colors.white,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  paySelectedText: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.pink,
  },
  estimateBanner: {
    marginBottom: spacing.md,
    padding: 18,
    borderRadius: 18,
    backgroundColor: colors.pinkSoft,
    borderWidth: 1,
    borderColor: colors.softBorder,
  },
  estimateEyebrow: {
    fontFamily: fonts.extraBold,
    fontSize: 10,
    letterSpacing: 1.8,
    color: colors.pink,
  },
  estimateTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.muted,
    marginTop: 8,
  },
  estimateValue: {
    fontFamily: fonts.extraBold,
    fontSize: 18,
    color: colors.ink,
    marginTop: 4,
    letterSpacing: -0.2,
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
  },
  footerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  footerAmountLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.muted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  footerAmount: {
    fontFamily: fonts.extraBold,
    fontSize: 22,
    color: colors.ink,
    letterSpacing: -0.3,
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
});
