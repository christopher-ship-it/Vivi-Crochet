import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type KeyboardEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getMyProfile } from '../src/api/me';
import { loadRegistrationDraft } from '../src/auth/registrationDraft';
import { useLearningCustomer, useShoppingSession } from '../src/auth/SessionContext';
import {
  commitCheckoutAddress,
  readCheckoutAddressEditInitial,
  type CheckoutAddressDraft,
} from '../src/checkout/checkoutAddressDraft';
import { PhoneInputField } from '../src/components/PhoneInputField';
import {
  composeInternationalPhone,
  dialCodeForCountry,
  isValidInternationalPhone,
  splitInternationalPhone,
} from '../src/data/dialCodes';
import { colors, fonts, spacing } from '../src/theme';
import { lookupIndianPincode } from '../src/utils/pincodeLookup';
import {
  getShippingAddressFieldErrors,
  isIndiaAccount,
  normalizePhone,
  normalizePin,
  normalizePostalCode,
  phoneFromCustomerLoginEmail,
  realCustomerName,
  type ShippingFieldKey,
} from '../src/utils/validation';

const INPUT_BG = '#f3f3f3';

function firstNonEmpty(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

export default function AddDeliveryAddressScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, isAuthenticated } = useShoppingSession();
  const { profile: learningProfile } = useLearningCustomer();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [dialCode, setDialCode] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [address1, setAddress1] = useState('');
  const [address2, setAddress2] = useState('');
  const [city, setCity] = useState('');
  const [addressState, setAddressState] = useState('');
  const [saveAddress, setSaveAddress] = useState(true);
  const [pinLookupPending, setPinLookupPending] = useState(false);
  const [locating, setLocating] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ShippingFieldKey, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [indiaAccount, setIndiaAccount] = useState(true);
  const [accountCountry, setAccountCountry] = useState('India');
  const scrollRef = useRef<ScrollView>(null);
  const mountedRef = useRef(true);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e: KeyboardEvent) => {
      if (!mountedRef.current) return;
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      if (!mountedRef.current) return;
      setKeyboardHeight(0);
    });
    return () => {
      mountedRef.current = false;
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  /** Scroll only the focused region — never measureLayout (crashes on unmount/nav). */
  const scrollFieldIntoView = useCallback((edge: 'start' | 'end') => {
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      if (edge === 'start') {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      } else {
        scrollRef.current?.scrollToEnd({ animated: true });
      }
    }, 80);
  }, []);

  const clearFieldError = useCallback((key: ShippingFieldKey) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const prefillContact = useCallback(async () => {
    const initial = readCheckoutAddressEditInitial();
    if (initial) {
      setFullName(initial.fullName ?? '');
      setAddress1(initial.address1 ?? '');
      setAddress2(initial.address2 ?? '');
      setCity(initial.city ?? '');
      setAddressState(initial.state ?? '');
      if (typeof initial.saveAddress === 'boolean') setSaveAddress(initial.saveAddress);
    }

    let resolvedPhoneRaw = firstNonEmpty(
      initial?.phone,
      learningProfile?.phone,
      user?.phone,
      phoneFromCustomerLoginEmail(user?.email),
    );
    let resolvedIndia = true;
    let resolvedDial = '';

    if (isAuthenticated) {
      try {
        const profile = await getMyProfile();
        const india = isIndiaAccount({
          authMethod: profile.authMethod,
          country: profile.country,
        });
        resolvedIndia = india;
        setIndiaAccount(india);
        const countryName = india
          ? 'India'
          : (profile.country?.trim() || profile.shippingAddress?.country?.trim() || '');
        setAccountCountry(countryName);
        if (!india) {
          // Prefer account country dial code — never invent +1 / US.
          const preferred = dialCodeForCountry(countryName) || '';
          const split = splitInternationalPhone(
            firstNonEmpty(initial?.phone, profile.phoneNumber, resolvedPhoneRaw),
            preferred || null,
          );
          resolvedDial = split.dial || preferred;
          setDialCode(resolvedDial);
          resolvedPhoneRaw = split.national || resolvedPhoneRaw.replace(/\D/g, '');
        } else {
          resolvedDial = '91';
          setDialCode('91');
          resolvedPhoneRaw = normalizePhone(
            firstNonEmpty(initial?.phone, profile.phoneNumber, resolvedPhoneRaw),
          );
        }

        if (!initial?.fullName) {
          setFullName((current) =>
            realCustomerName(current, profile.fullName, user?.name, profile.shippingAddress?.fullName),
          );
        }
        const saved = profile.shippingAddress;
        if (saved && !initial?.address1) {
          setAddress1(saved.addressLine1);
          setAddress2(saved.addressLine2 ?? '');
          setCity(saved.city);
          setAddressState(saved.state);
          setPinCode(
            india ? normalizePin(saved.pinCode) : normalizePostalCode(saved.pinCode),
          );
        }
        if (initial?.pinCode) {
          setPinCode(india ? normalizePin(initial.pinCode) : normalizePostalCode(initial.pinCode));
        }
      } catch {
        // Best-effort prefill.
      }
    } else if (initial?.pinCode) {
      setPinCode(normalizePin(initial.pinCode));
    }

    if (!resolvedPhoneRaw) {
      const draft = await loadRegistrationDraft();
      resolvedPhoneRaw = draft?.phone ?? '';
    }

    if (resolvedPhoneRaw) {
      setPhone((current) => {
        if (current.trim()) return current;
        return resolvedIndia
          ? normalizePhone(resolvedPhoneRaw)
          : resolvedPhoneRaw.replace(/\D/g, '');
      });
      if (!resolvedIndia && resolvedDial) setDialCode(resolvedDial);
    }

    if (!initial?.fullName) {
      setFullName((current) =>
        realCustomerName(current, learningProfile?.fullName, user?.name) || current,
      );
    }
  }, [isAuthenticated, learningProfile?.fullName, learningProfile?.phone, user?.email, user?.name, user?.phone]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace({ pathname: '/login', params: { returnTo: '/add-delivery-address' } });
      return;
    }
    void prefillContact();
  }, [isAuthenticated, prefillContact, router]);

  useEffect(() => {
    if (!indiaAccount) {
      setPinLookupPending(false);
      return;
    }
    const pin = normalizePin(pinCode);
    if (pin.length !== 6) return;

    let cancelled = false;
    setPinLookupPending(true);
    void (async () => {
      const result = await lookupIndianPincode(pin);
      if (cancelled) return;
      setPinLookupPending(false);
      if (result) {
        setCity(result.city);
        setAddressState(result.state);
        clearFieldError('city');
        clearFieldError('state');
        clearFieldError('pinCode');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clearFieldError, indiaAccount, pinCode]);

  async function handleAutoDetect() {
    setLocating(true);
    setFormError(null);
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
        Alert.alert('Could not find address', 'Try entering your PIN and address manually.');
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
      setAddressState(place.region || '');
      setPinCode(
        indiaAccount
          ? normalizePin(place.postalCode || '')
          : normalizePostalCode(place.postalCode || ''),
      );
      setSaveAddress(true);
      setFieldErrors({});
    } catch {
      Alert.alert('Location failed', 'Could not read your location. Enter the address manually.');
    } finally {
      setLocating(false);
    }
  }

  function resolveDeliveryPhone(): string {
    if (indiaAccount) return normalizePhone(phone);
    return composeInternationalPhone(dialCode, phone);
  }

  function handleShipHere() {
    setFormError(null);
    const deliveryPhone = resolveDeliveryPhone();

    if (!indiaAccount) {
      if (!dialCode) {
        setFieldErrors({ phone: 'Select a country calling code.' });
        return;
      }
      if (!isValidInternationalPhone(dialCode, phone)) {
        setFieldErrors({ phone: 'Enter a valid phone number for the selected country code.' });
        return;
      }
    }

    const errors = getShippingAddressFieldErrors({
      fullName,
      phone: deliveryPhone,
      address1,
      city,
      state: addressState,
      pinCode,
      requireIndianPhone: indiaAccount,
      requireIndianPin: indiaAccount,
    });
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    const draft: CheckoutAddressDraft = {
      fullName: fullName.trim(),
      phone: deliveryPhone,
      address1: address1.trim(),
      address2: address2.trim(),
      landmark: '',
      city: city.trim(),
      state: addressState.trim(),
      pinCode: indiaAccount ? normalizePin(pinCode) : normalizePostalCode(pinCode).trim(),
      saveAddress,
    };

    try {
      Keyboard.dismiss();
      commitCheckoutAddress(draft);
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/checkout');
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save this address.');
    }
  }

  const cityLabel = indiaAccount ? 'City' : 'City';
  const stateLabel = indiaAccount ? 'State' : 'State / Province / Region';
  const pinLabel = indiaAccount ? 'Pincode' : 'Postal code';

  return (
    <>
      <Stack.Screen options={{ title: 'Add New Address', headerShadowVisible: false }} />
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            {
              flexGrow: 1,
              paddingBottom: Math.max(insets.bottom, 12) + 24 + keyboardHeight,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sectionHeadRow}>
            <Text style={styles.sectionTitle}>Address</Text>
            <Pressable
              style={styles.autoDetect}
              onPress={() => void handleAutoDetect()}
              disabled={locating}
              hitSlop={8}
            >
              {locating ? (
                <ActivityIndicator size="small" color={colors.pink} />
              ) : (
                <>
                  <Text style={styles.autoDetectText}>Auto Detect</Text>
                  <Ionicons name="locate-outline" size={18} color={colors.pink} />
                </>
              )}
            </Pressable>
          </View>
          <Text style={styles.requiredHint}>
            <Text style={styles.requiredStar}>*</Text> Required
          </Text>

          <LabeledField
            label={pinLabel}
            required
            value={pinCode}
            onChangeText={(value) => {
              setPinCode(indiaAccount ? normalizePin(value) : normalizePostalCode(value));
              clearFieldError('pinCode');
            }}
            placeholder={indiaAccount ? '6-digit PIN' : 'Postal / ZIP code'}
            keyboardType={indiaAccount ? 'number-pad' : 'default'}
            maxLength={indiaAccount ? 6 : 12}
            error={fieldErrors.pinCode}
            onFocus={() => scrollFieldIntoView('start')}
            trailing={
              pinLookupPending ? (
                <ActivityIndicator size="small" color={colors.pink} />
              ) : null
            }
          />

          <LabeledField
            label="House / Flat / Office No"
            required
            value={address1}
            onChangeText={(value) => {
              setAddress1(value);
              clearFieldError('address1');
            }}
            placeholder="House/ Flat/ Office No"
            error={fieldErrors.address1}
            onFocus={() => scrollFieldIntoView('start')}
          />

          <LabeledField
            label="Road / Area / Colony"
            optional
            value={address2}
            onChangeText={setAddress2}
            placeholder="Road Name/ Area/ Colony"
            multiline
            onFocus={() => scrollFieldIntoView('start')}
          />

          {!indiaAccount && accountCountry ? (
            <View style={styles.countryReadonly}>
              <Text style={styles.fieldLabel}>Country</Text>
              <Text style={styles.countryReadonlyText}>{accountCountry}</Text>
            </View>
          ) : null}

          <View style={styles.fieldRow}>
            <LabeledField
              label={cityLabel}
              required
              style={styles.fieldHalf}
              value={city}
              onChangeText={(value) => {
                setCity(value);
                clearFieldError('city');
              }}
              placeholder={indiaAccount ? 'Coimbatore' : 'City'}
              autoCapitalize="words"
              error={fieldErrors.city}
              onFocus={() => scrollFieldIntoView('end')}
            />
            <LabeledField
              label={stateLabel}
              required
              style={styles.fieldHalf}
              value={addressState}
              onChangeText={(value) => {
                setAddressState(value);
                clearFieldError('state');
              }}
              placeholder={indiaAccount ? 'Tamil Nadu' : 'State / Region'}
              autoCapitalize="words"
              error={fieldErrors.state}
              onFocus={() => scrollFieldIntoView('end')}
            />
          </View>

          <View style={styles.defaultRow}>
            <Text style={styles.defaultLabel}>Use as default address</Text>
            <Switch
              value={saveAddress}
              onValueChange={setSaveAddress}
              trackColor={{ false: '#e8dfe3', true: colors.pinkMist }}
              thumbColor={saveAddress ? colors.pink : colors.white}
            />
          </View>

          <Text style={[styles.sectionTitle, styles.contactTitle]}>Contact</Text>

          <LabeledField
            label="Name"
            required
            value={fullName}
            onChangeText={(value) => {
              setFullName(value);
              clearFieldError('fullName');
            }}
            placeholder="Recipient full name"
            autoCapitalize="words"
            error={fieldErrors.fullName}
            onFocus={() => scrollFieldIntoView('end')}
          />

          <PhoneInputField
            indiaMode={indiaAccount}
            dialCode={dialCode}
            onDialCodeChange={(next) => {
              setDialCode(next);
              clearFieldError('phone');
            }}
            value={phone}
            onChangeText={(value) => {
              setPhone(value);
              clearFieldError('phone');
            }}
            onFocus={() => scrollFieldIntoView('end')}
            error={fieldErrors.phone}
            required
            compact
          />

          {formError ? <Text style={styles.formError}>{formError}</Text> : null}

          <Pressable style={styles.shipBtn} onPress={handleShipHere}>
            <Text style={styles.shipBtnText}>Ship to this address</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

function LabeledField({
  label,
  required,
  optional,
  error,
  trailing,
  multiline,
  style,
  onFocus,
  ...inputProps
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  trailing?: ReactNode;
  multiline?: boolean;
  style?: object;
} & ComponentProps<typeof TextInput>) {
  return (
    <View style={[styles.fieldBlock, style]}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.requiredStar}> *</Text> : null}
        {optional ? <Text style={styles.optionalMark}> · optional</Text> : null}
      </Text>
      <View style={styles.inputWrap}>
        <TextInput
          {...inputProps}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : inputProps.textAlignVertical}
          placeholderTextColor="#9a9196"
          onFocus={onFocus}
          style={[
            styles.input,
            multiline && styles.inputMultiline,
            error ? styles.inputError : null,
            inputProps.style,
          ]}
        />
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.white,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: 6,
  },
  sectionHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  sectionTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 15,
    color: colors.ink,
  },
  autoDetect: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  autoDetectText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.pink,
  },
  requiredHint: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
    marginBottom: 8,
  },
  requiredStar: {
    color: colors.pink,
    fontFamily: fonts.semiBold,
  },
  optionalMark: {
    color: colors.muted,
    fontFamily: fonts.regular,
  },
  fieldBlock: {
    marginBottom: 8,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 8,
  },
  fieldHalf: {
    flex: 1,
  },
  fieldLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.ink,
    marginBottom: 4,
  },
  inputWrap: {
    position: 'relative',
  },
  input: {
    backgroundColor: INPUT_BG,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.ink,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  inputError: {
    borderColor: colors.danger,
  },
  inputMultiline: {
    minHeight: 56,
    paddingTop: 10,
  },
  trailing: {
    position: 'absolute',
    right: 10,
    top: 10,
  },
  fieldError: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.danger,
    marginTop: 3,
  },
  countryReadonly: {
    backgroundColor: INPUT_BG,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  countryReadonlyText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.ink,
  },
  defaultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
    marginBottom: 10,
  },
  defaultLabel: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.ink,
    flex: 1,
    paddingRight: 12,
  },
  contactTitle: {
    marginBottom: 6,
  },
  formError: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.danger,
    marginTop: 4,
  },
  shipBtn: {
    marginTop: 12,
    marginBottom: 8,
    backgroundColor: colors.pink,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  shipBtnText: {
    fontFamily: fonts.extraBold,
    fontSize: 14,
    color: colors.white,
  },
});
