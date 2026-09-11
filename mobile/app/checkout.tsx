import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { formatDeliveryRange } from '../src/utils/orders';
import {
  getShippingAddressError,
  isValidEmail,
  isValidName,
  normalizePhone,
  normalizePin,
  realCustomerName,
} from '../src/utils/validation';

const FIELD_BORDER = '#eadfe3';
const FIELD_BG = '#fffdfd';
const PANEL_BORDER = '#eadfe3';
const ACCENT_SOFT = '#fff0f4';
const CARD_BG = '#ffffff';
const PAGE_BG = 'transparent';

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
  badge,
  children,
}: {
  step?: string;
  title: string;
  subtitle?: string;
  badge?: string;
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

function SummaryLine({ item, index }: { item: CartLineItem; index: number }) {
  const fallback = ['#ffe3ec', '#fff0f4', '#ffeaf1', '#ffffff'][index % 4];
  return (
    <View style={styles.summaryLine}>
      <View style={[styles.summaryThumb, !item.imageUrl && { backgroundColor: fallback }]}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.summaryThumbImage} resizeMode="contain" />
        ) : (
          <Text style={styles.summaryThumbInitial}>{item.name.charAt(0)}</Text>
        )}
      </View>
      <View style={styles.summaryLineBody}>
        <Text style={styles.summaryLineName} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.summaryLineMeta}>Qty: {item.quantity}</Text>
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

function formatPhoneDisplay(phone: string): string {
  const digits = normalizePhone(phone);
  if (digits.length !== 10) return digits ? `+91 ${digits}` : 'Add phone number';
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
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
    normalizePhone(firstNonEmpty(learningProfile?.phone, user?.phone)),
  );
  const [address1, setAddress1] = useState('');
  const [address2, setAddress2] = useState('');
  const [landmark, setLandmark] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [saveAddress, setSaveAddress] = useState(true);
  const [editingEmail, setEditingEmail] = useState(false);
  const [editingDelivery, setEditingDelivery] = useState(false);
  const [showAddAddressOptions, setShowAddAddressOptions] = useState(false);
  const [locatingAddress, setLocatingAddress] = useState(false);
  const [quote, setQuote] = useState<DeliveryQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [checkoutPayload, setCheckoutPayload] = useState<RazorpayCheckoutPayload | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
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
        const profileEmail = profile.email?.trim() ?? '';
        if (isUsableCheckoutEmail(profileEmail)) {
          setEmail((current) => (isUsableCheckoutEmail(current) ? current : profileEmail));
          setEditingEmail(false);
        } else {
          setEmail((current) => (isUsableCheckoutEmail(current) ? current : ''));
          setEditingEmail(false);
        }
        setPhone((current) => normalizePhone(current) || normalizePhone(profile.phoneNumber));

        const saved = profile.shippingAddress;
        setFullName((current) =>
          realCustomerName(current, profile.fullName, user?.name, saved?.fullName),
        );
        if (saved) {
          setSaveAddress(true);
          setPhone((current) => normalizePhone(current) || normalizePhone(saved.phoneNumber));
          setAddress1((current) => current.trim() || saved.addressLine1);
          setAddress2((current) => current.trim() || saved.addressLine2 || '');
          setLandmark((current) => current.trim() || saved.landmark || '');
          setCity((current) => current.trim() || saved.city);
          setState((current) => current.trim() || saved.state);
          setPinCode((current) => normalizePin(current) || normalizePin(saved.pinCode));
          setEditingDelivery(false);
          setShowAddAddressOptions(false);
        } else {
          setEditingDelivery(false);
          setShowAddAddressOptions(false);
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
  const emailReady = isUsableCheckoutEmail(email);
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
  const phoneDisplay = formatPhoneDisplay(effectivePhone);
  const emailDisplay = emailReady ? email.trim() : 'Add your email';

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

  function openAddAddress() {
    setEditingDelivery(false);
    setShowAddAddressOptions(true);
  }

  function openManualAddress() {
    setShowAddAddressOptions(false);
    setEditingDelivery(true);
  }

  async function fillFromCurrentLocation() {
    setLocatingAddress(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert(
          'Location needed',
          'Allow location access to fill your address, or enter it manually.',
        );
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const places = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      const place = places[0];
      if (!place) {
        Alert.alert('Could not find address', 'Try entering your address manually.');
        openManualAddress();
        return;
      }

      const streetParts = [place.streetNumber, place.street]
        .map((part) => part?.trim())
        .filter(Boolean);
      const street =
        streetParts.join(' ')
        || (place.name && place.name !== place.city ? place.name : '')
        || place.district
        || '';
      const area = [place.district, place.subregion]
        .map((part) => part?.trim())
        .filter((part): part is string => Boolean(part) && part !== place.city && part !== street)
        .filter((part, index, all) => all.indexOf(part) === index)
        .join(', ');

      setAddress1(street);
      setAddress2(area);
      setCity(place.city || place.subregion || place.district || '');
      setState(place.region || '');
      setPinCode(normalizePin(place.postalCode || ''));
      setSaveAddress(true);
      setShowAddAddressOptions(false);
      setEditingDelivery(true);
    } catch {
      Alert.alert('Location failed', 'Could not read your location. Enter the address manually.');
      openManualAddress();
    } finally {
      setLocatingAddress(false);
    }
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
    if (!isUsableCheckoutEmail(email)) {
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

    if (!isUsableCheckoutEmail(email)) {
      setEditingEmail(true);
      setStatus('Enter a valid email for order updates.');
      Alert.alert('Email required', 'Enter a valid email for order updates.');
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
      setEditingDelivery(hasDeliveryAddress);
      setShowAddAddressOptions(!hasDeliveryAddress);
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
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'VIVI CROCHET',
          headerRight: () => (
            <View style={styles.secureHeader}>
              <Text style={styles.secureLock}>🔒</Text>
              <Text style={styles.secureHeaderText}>Secure Payment</Text>
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
          <Text style={styles.pageTitle}>Checkout</Text>
          <Text style={styles.pageSubtitle}>
            Almost there! Review your details and place your order.
          </Text>
        </View>

        {!isAuthenticated ? (
          <View style={styles.authPanel}>
            <Text style={styles.authTitle}>Almost there</Text>
            <Text style={styles.authBody}>
              Verify your mobile number to place the order. You’ll be notified once payment is done.
            </Text>
          </View>
        ) : (
          <>
            <Section
              step="1"
              title="Order updates"
              subtitle="We'll email your booking confirmation here."
            >
              <View style={styles.card}>
                <View style={styles.cardTopRow}>
                  <View style={styles.cardIcon}>
                    <Ionicons name="mail-outline" size={18} color={colors.pink} />
                  </View>
                  <Text style={styles.cardHeading}>Email</Text>
                  <Pressable onPress={() => setEditingEmail(true)} hitSlop={8}>
                    <Text style={styles.editLink}>{emailReady ? 'Edit' : 'Add'}</Text>
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

            <Section step="2" title="Delivery" badge="Ships across India">
              <View style={styles.cardStack}>
                <View style={styles.card}>
                  <View style={styles.cardTopRow}>
                    <View style={styles.cardIcon}>
                      <Ionicons name="location-outline" size={18} color={colors.pink} />
                    </View>
                    <Text style={styles.cardHeading}>Delivery address</Text>
                    {hasDeliveryAddress ? (
                      <Pressable
                        onPress={() => {
                          setShowAddAddressOptions(false);
                          setEditingDelivery(true);
                        }}
                        hitSlop={8}
                      >
                        <Text style={styles.editLink}>Edit</Text>
                      </Pressable>
                    ) : showAddAddressOptions ? null : (
                      <Pressable onPress={openAddAddress} hitSlop={8}>
                        <Text style={styles.editLink}>Add</Text>
                      </Pressable>
                    )}
                  </View>

                  {!hasDeliveryAddress ? (
                    showAddAddressOptions || locatingAddress ? (
                      <View style={styles.addOptions}>
                        <Pressable
                          style={[styles.addOptionBtn, locatingAddress && styles.addOptionDisabled]}
                          onPress={() => void fillFromCurrentLocation()}
                          disabled={locatingAddress}
                        >
                          {locatingAddress ? (
                            <ActivityIndicator color={colors.pink} />
                          ) : (
                            <Text style={styles.addOptionText}>Use current location</Text>
                          )}
                        </Pressable>
                        <Pressable
                          style={[styles.addOptionBtn, locatingAddress && styles.addOptionDisabled]}
                          onPress={openManualAddress}
                          disabled={locatingAddress}
                        >
                          <Text style={styles.addOptionText}>Enter address manually</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable onPress={openAddAddress}>
                        <Text style={styles.cardMetaPlaceholder}>
                          Add where we should deliver your order.
                        </Text>
                      </Pressable>
                    )
                  ) : (
                    <>
                      <Pressable
                        onPress={() => {
                          setShowAddAddressOptions(false);
                          setEditingDelivery(true);
                        }}
                      >
                        <Text style={styles.cardValue}>{fullName || 'Add recipient name'}</Text>
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
                            House / street, Area, City, State – Pincode
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
                        <Text style={styles.saveTitle}>Save this address for next time</Text>
                      </Pressable>
                    </>
                  )}
                </View>

                <View style={styles.estimateCard}>
                  <Text style={styles.estimateIcon}>🚚</Text>
                  <View style={styles.estimateCopy}>
                    <Text style={styles.estimateLabel}>Estimated delivery</Text>
                    <Text style={styles.estimateDetail}>
                      {quoteError && !quote
                        ? quoteError
                        : 'Coimbatore typically arrives faster'}
                    </Text>
                  </View>
                  <Text style={styles.estimateRange}>
                    {quote
                      ? estimateLabel(quote)
                      : shippingReady
                        ? '…'
                        : '—'}
                  </Text>
                  <Text style={styles.estimateChevron}>›</Text>
                </View>
              </View>
            </Section>

            <Section step="3" title="Order summary">
              <View style={styles.card}>
                {items.map((item, index) => (
                  <SummaryLine key={item.productId} item={item} index={index} />
                ))}
                <View style={styles.breakdown}>
                  <View style={styles.orderSummaryRow}>
                    <Text style={styles.orderSummaryKey}>Items ({itemCount})</Text>
                    <Text style={styles.orderSummaryVal}>{formatInr(subtotal)}</Text>
                  </View>
                  <View style={styles.orderSummaryRow}>
                    <Text style={styles.orderSummaryKey}>Delivery</Text>
                    <Text style={styles.orderSummaryMuted}>Calculated at next step</Text>
                  </View>
                  <View style={[styles.orderSummaryRow, styles.orderSummaryTotal]}>
                    <Text style={styles.orderSummaryTotalKey}>Total Amount</Text>
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
              <Text style={styles.trustTitle}>Secure & Safe Payments</Text>
              <Text style={styles.trustBody}>Your payment information is always protected.</Text>
            </View>
          </View>
          <Pressable
            style={[styles.proceedBtn, purchasing && styles.btnDisabled]}
            onPress={() => {
              if (isAuthenticated && !emailReady) {
                setEditingEmail(true);
                Alert.alert('Email required', 'Add your email for order updates.');
                return;
              }
              if (isAuthenticated && !shippingReady) {
                if (hasDeliveryAddress) {
                  setEditingDelivery(true);
                } else {
                  openAddAddress();
                }
              }
              void handlePay();
            }}
            disabled={purchasing}
          >
            <Text style={styles.proceedBtnText}>
              {!isAuthenticated
                ? 'Continue · Verify mobile →'
                : purchasing
                  ? 'Starting payment…'
                  : !checkoutReady
                    ? 'Complete delivery to pay →'
                    : 'Pay online →'}
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
          style={styles.sheetRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.sheetBackdrop} onPress={() => setEditingEmail(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {emailReady ? 'Edit email' : 'Add email'}
              </Text>
              <Pressable onPress={() => setEditingEmail(false)} hitSlop={8}>
                <Text style={styles.sheetClose}>Close</Text>
              </Pressable>
            </View>
            <View style={styles.sheetScroll}>
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
            </View>
            <Pressable
              style={styles.sheetSaveBtn}
              onPress={() => {
                if (!isUsableCheckoutEmail(email)) {
                  Alert.alert('Email required', 'Enter a valid email for order updates.');
                  return;
                }
                setEditingEmail(false);
              }}
            >
              <Text style={styles.sheetSaveBtnText}>
                {emailReady ? 'Save email' : 'Add email'}
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={editingDelivery}
        transparent
        animationType="slide"
        onRequestClose={() => setEditingDelivery(false)}
      >
        <KeyboardAvoidingView
          style={styles.sheetRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.sheetBackdrop} onPress={() => setEditingDelivery(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {hasDeliveryAddress ? 'Edit delivery address' : 'Add delivery address'}
              </Text>
              <Pressable onPress={() => setEditingDelivery(false)} hitSlop={8}>
                <Text style={styles.sheetClose}>Close</Text>
              </Pressable>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.sheetScroll}
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
                onChangeText={(value) => {
                  setAddress1(value);
                  if (value.trim().length > 0) setSaveAddress(true);
                }}
                placeholder="House / street"
              />
              <Pressable
                style={styles.saveRow}
                onPress={() => setSaveAddress((value) => !value)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: saveAddress }}
              >
                <View style={[styles.saveCheck, saveAddress && styles.saveCheckOn]}>
                  {saveAddress ? <Text style={styles.saveCheckMark}>✓</Text> : null}
                </View>
                <Text style={styles.saveTitle}>Save this address for next time</Text>
              </Pressable>
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
              {shippingAddressError ? (
                <Text style={styles.fieldHint}>{shippingAddressError}</Text>
              ) : null}
            </ScrollView>
            <Pressable
              style={styles.sheetSaveBtn}
              onPress={() => {
                if (shippingAddressError) {
                  Alert.alert('Delivery details incomplete', shippingAddressError);
                  return;
                }
                setShowAddAddressOptions(false);
                setEditingDelivery(false);
              }}
            >
              <Text style={styles.sheetSaveBtnText}>Save address</Text>
            </Pressable>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },
  scroll: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  secureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginRight: 4,
  },
  secureLock: {
    fontSize: 11,
  },
  secureHeaderText: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.muted,
  },
  pageHeader: {
    marginBottom: spacing.lg,
    paddingTop: 4,
  },
  pageTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 28,
    color: colors.ink,
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.muted,
    marginTop: 6,
    lineHeight: 20,
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
  addOptions: {
    gap: 8,
    marginTop: 4,
  },
  addOptionBtn: {
    borderWidth: 1,
    borderColor: PANEL_BORDER,
    backgroundColor: ACCENT_SOFT,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  addOptionDisabled: {
    opacity: 0.7,
  },
  addOptionText: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.ink,
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
    maxHeight: '92%',
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
    gap: 12,
    paddingBottom: spacing.md,
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
