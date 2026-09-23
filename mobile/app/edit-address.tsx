import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClientError } from '../src/api/client';
import {
  getMyProfile,
  updateMyProfile,
  type AddressTag,
  type SavedShippingAddress,
} from '../src/api/me';
import { useShoppingSession } from '../src/auth/SessionContext';
import { PhoneInputField } from '../src/components/PhoneInputField';
import {
  composeInternationalPhone,
  dialCodeForCountry,
  isValidInternationalPhone,
  splitInternationalPhone,
} from '../src/data/dialCodes';
import { colors, fonts, spacing } from '../src/theme';
import {
  getShippingAddressFieldErrors,
  isIndiaAccount,
  normalizePhone,
  normalizePin,
  normalizePostalCode,
  realCustomerName,
  type ShippingFieldKey,
} from '../src/utils/validation';

const ADDRESS_TAGS: AddressTag[] = ['Home', 'Work', 'Other'];

function normalizeAddressTag(value?: string | null): AddressTag {
  if (value === 'Work' || value === 'Other' || value === 'Home') return value;
  return 'Home';
}

export default function EditAddressScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, isAuthenticated } = useShoppingSession();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ShippingFieldKey, string>>>({});
  const [fullName, setFullName] = useState(() => realCustomerName(user?.name));
  const [phone, setPhone] = useState(() => (user?.phone ?? '').replace(/\D/g, ''));
  const [dialCode, setDialCode] = useState('91');
  const [address1, setAddress1] = useState('');
  const [address2, setAddress2] = useState('');
  const [landmark, setLandmark] = useState('');
  const [tag, setTag] = useState<AddressTag>('Home');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [accountCountry, setAccountCountry] = useState('India');
  const [indiaAccount, setIndiaAccount] = useState(true);
  const [locating, setLocating] = useState(false);

  const clearFieldError = useCallback((key: ShippingFieldKey) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const applySaved = useCallback((
    saved: SavedShippingAddress | null | undefined,
    profileName: string | undefined,
    india: boolean,
    countryName: string,
    profilePhone?: string | null,
  ) => {
    const preferredDial = india ? '91' : (dialCodeForCountry(countryName) || '');
    const rawPhone = saved?.phoneNumber || profilePhone || user?.phone || '';

    if (!saved) {
      setFullName((current) => realCustomerName(current, profileName, user?.name));
      if (india) {
        setDialCode('91');
        setPhone((current) => normalizePhone(current) || normalizePhone(rawPhone));
      } else {
        const split = splitInternationalPhone(rawPhone, preferredDial);
        setDialCode(split.dial || preferredDial);
        setPhone(split.national || '');
      }
      setTag('Home');
      return;
    }

    setFullName(realCustomerName(saved.fullName, profileName, user?.name) || saved.fullName);
    if (india) {
      setDialCode('91');
      setPhone(normalizePhone(saved.phoneNumber));
    } else {
      const split = splitInternationalPhone(saved.phoneNumber, preferredDial);
      setDialCode(split.dial || preferredDial);
      setPhone(split.national || '');
    }
    setAddress1(saved.addressLine1);
    setAddress2(saved.addressLine2 ?? '');
    setLandmark(saved.landmark ?? '');
    setTag(normalizeAddressTag(saved.tag));
    setCity(saved.city);
    setState(saved.state);
    setPinCode(india ? normalizePin(saved.pinCode) : normalizePostalCode(saved.pinCode));
  }, [user?.name, user?.phone]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace({ pathname: '/login', params: { returnTo: '/edit-address' } });
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const profile = await getMyProfile();
        if (cancelled) return;
        const india = isIndiaAccount({
          authMethod: profile.authMethod,
          country: profile.country,
        });
        setIndiaAccount(india);
        const countryName = india
          ? 'India'
          : (profile.country?.trim() || profile.shippingAddress?.country?.trim() || '');
        setAccountCountry(countryName);
        applySaved(
          profile.shippingAddress,
          profile.fullName,
          india,
          countryName,
          profile.phoneNumber,
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Could not load your address.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applySaved, isAuthenticated, router]);

  function resolvePhone(): string {
    if (indiaAccount) return normalizePhone(phone);
    return composeInternationalPhone(dialCode, phone);
  }

  async function handleSave() {
    setError(null);
    const deliveryPhone = resolvePhone();

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
      state,
      pinCode,
      requireIndianPhone: indiaAccount,
      requireIndianPin: indiaAccount,
    });
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setSaving(true);
    try {
      await updateMyProfile({
        fullName: fullName.trim(),
        shippingAddress: {
          fullName: fullName.trim(),
          phoneNumber: deliveryPhone,
          addressLine1: address1.trim(),
          addressLine2: address2.trim() || undefined,
          landmark: landmark.trim() || undefined,
          tag,
          city: city.trim(),
          state: state.trim(),
          pinCode: indiaAccount ? normalizePin(pinCode) : normalizePostalCode(pinCode).trim(),
          country: indiaAccount ? 'India' : accountCountry || undefined,
        },
      });
      router.back();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not save address.');
    } finally {
      setSaving(false);
    }
  }

  async function handleAutoDetect() {
    setLocating(true);
    setError(null);
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
      setPinCode(
        indiaAccount
          ? normalizePin(place.postalCode || '')
          : normalizePostalCode(place.postalCode || ''),
      );
      if (place.country?.trim() && !indiaAccount) {
        setAccountCountry(place.country.trim());
      }
      setFieldErrors({});
    } catch {
      Alert.alert('Location failed', 'Could not read your location. Enter the address manually.');
    } finally {
      setLocating(false);
    }
  }

  const cityPlaceholder = indiaAccount ? 'Coimbatore' : 'City';
  const statePlaceholder = indiaAccount ? 'Tamil Nadu' : 'State / Province / Region';
  const pinLabel = indiaAccount ? 'PIN' : 'Postal code';
  const pinPlaceholder = indiaAccount ? '641001' : 'Postal / ZIP code';
  const stateLabel = indiaAccount ? 'State' : 'State / Province / Region';

  return (
    <>
      <Stack.Screen options={{ title: 'Address', headerShadowVisible: false }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.pink} />
            <Text style={styles.loadingText}>Loading address…</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.headerRow}>
              <Text style={styles.lead}>Manage your saved address</Text>
              <Pressable
                style={styles.autoDetect}
                onPress={() => void handleAutoDetect()}
                disabled={locating || saving}
                hitSlop={8}
              >
                {locating ? (
                  <ActivityIndicator size="small" color={colors.pink} />
                ) : (
                  <>
                    <Text style={styles.autoDetectText}>Auto Detect</Text>
                    <Ionicons name="locate-outline" size={16} color={colors.pink} />
                  </>
                )}
              </Pressable>
            </View>

            <Text style={styles.requiredHint}>
              Fields marked with <Text style={styles.requiredStar}>*</Text> are mandatory.
            </Text>

            <Field
              label="Recipient name"
              required
              value={fullName}
              onChangeText={(value) => {
                setFullName(value);
                clearFieldError('fullName');
              }}
              autoCapitalize="words"
              error={fieldErrors.fullName}
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
              error={fieldErrors.phone}
              required
            />

            <Field
              label="Address line 1"
              required
              value={address1}
              onChangeText={(value) => {
                setAddress1(value);
                clearFieldError('address1');
              }}
              placeholder="House / street"
              error={fieldErrors.address1}
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

            <View style={styles.tagBlock}>
              <Text style={styles.fieldLabel}>Save as</Text>
              <View style={styles.tagRow}>
                {ADDRESS_TAGS.map((option) => {
                  const selected = tag === option;
                  return (
                    <Pressable
                      key={option}
                      onPress={() => setTag(option)}
                      style={[styles.tagChip, selected && styles.tagChipSelected]}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <Text style={[styles.tagChipText, selected && styles.tagChipTextSelected]}>
                        {option}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {!indiaAccount && accountCountry ? (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Country</Text>
                <Text style={styles.countryValue}>{accountCountry}</Text>
              </View>
            ) : null}

            <View style={styles.row}>
              <Field
                label="City"
                required
                style={styles.half}
                value={city}
                onChangeText={(value) => {
                  setCity(value);
                  clearFieldError('city');
                }}
                autoCapitalize="words"
                placeholder={cityPlaceholder}
                error={fieldErrors.city}
              />
              <Field
                label={pinLabel}
                required
                style={styles.half}
                value={pinCode}
                onChangeText={(value) => {
                  setPinCode(indiaAccount ? normalizePin(value) : normalizePostalCode(value));
                  clearFieldError('pinCode');
                }}
                keyboardType={indiaAccount ? 'number-pad' : 'default'}
                maxLength={indiaAccount ? 6 : 12}
                placeholder={pinPlaceholder}
                error={fieldErrors.pinCode}
              />
            </View>
            <Field
              label={stateLabel}
              required
              value={state}
              onChangeText={(value) => {
                setState(value);
                clearFieldError('state');
              }}
              autoCapitalize="words"
              placeholder={statePlaceholder}
              error={fieldErrors.state}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              disabled={saving}
              onPress={() => void handleSave()}
            >
              <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save address'}</Text>
            </Pressable>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </>
  );
}

function Field({
  label,
  optional,
  required,
  error,
  style,
  ...inputProps
}: {
  label: string;
  optional?: boolean;
  required?: boolean;
  error?: string;
  style?: object;
} & ComponentProps<typeof TextInput>) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.requiredStar}> *</Text> : null}
        {optional ? <Text style={styles.optional}> · optional</Text> : null}
      </Text>
      <TextInput
        {...inputProps}
        placeholderTextColor={colors.muted}
        style={[styles.input, error ? styles.inputError : null]}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.cream },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 2,
  },
  lead: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
    flex: 1,
  },
  requiredHint: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    marginBottom: 2,
  },
  requiredStar: {
    color: colors.danger,
    fontFamily: fonts.semiBold,
  },
  autoDetect: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  autoDetectText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.pink,
  },
  field: { gap: 4 },
  row: { flexDirection: 'row', gap: 8 },
  half: { flex: 1 },
  tagBlock: { gap: 6 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagChip: {
    borderWidth: 1,
    borderColor: colors.softBorder,
    backgroundColor: colors.white,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tagChipSelected: {
    borderColor: colors.pink,
    backgroundColor: colors.pinkSoft,
  },
  tagChipText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.muted,
  },
  tagChipTextSelected: {
    color: colors.pinkDark,
  },
  fieldLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  countryValue: {
    borderWidth: 1,
    borderColor: colors.softBorder,
    backgroundColor: colors.white,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 11 : 9,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.ink,
  },
  optional: {
    fontFamily: fonts.regular,
    fontSize: 9,
    letterSpacing: 0,
    textTransform: 'none',
    color: '#b5a8ad',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.softBorder,
    backgroundColor: colors.white,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 11 : 9,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.ink,
  },
  inputError: {
    borderColor: colors.danger,
  },
  fieldError: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.danger,
    lineHeight: 16,
  },
  error: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.danger,
    lineHeight: 17,
  },
  saveBtn: {
    marginTop: 4,
    backgroundColor: colors.pink,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveText: {
    fontFamily: fonts.extraBold,
    fontSize: 14,
    color: colors.white,
  },
});
