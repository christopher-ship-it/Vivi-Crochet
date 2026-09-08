import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
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
import { getMyProfile, updateMyProfile, type SavedShippingAddress } from '../src/api/me';
import { useShoppingSession } from '../src/auth/SessionContext';
import { colors, fonts, spacing } from '../src/theme';
import {
  getShippingAddressError,
  normalizePhone,
  normalizePin,
} from '../src/utils/validation';

export default function EditAddressScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, isAuthenticated } = useShoppingSession();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [address1, setAddress1] = useState('');
  const [address2, setAddress2] = useState('');
  const [landmark, setLandmark] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pinCode, setPinCode] = useState('');

  const applySaved = useCallback((saved: SavedShippingAddress | null | undefined, profileName?: string) => {
    if (!saved) {
      setFullName((current) => current.trim() || profileName || user?.name || '');
      setPhone((current) => normalizePhone(current) || normalizePhone(user?.phone ?? ''));
      return;
    }
    setFullName(saved.fullName);
    setPhone(normalizePhone(saved.phoneNumber));
    setAddress1(saved.addressLine1);
    setAddress2(saved.addressLine2 ?? '');
    setLandmark(saved.landmark ?? '');
    setCity(saved.city);
    setState(saved.state);
    setPinCode(normalizePin(saved.pinCode));
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
        applySaved(profile.shippingAddress, profile.fullName);
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

  async function handleSave() {
    const validationError = getShippingAddressError({
      fullName,
      phone,
      address1,
      city,
      state,
      pinCode,
    });
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updateMyProfile({
        shippingAddress: {
          fullName: fullName.trim(),
          phoneNumber: normalizePhone(phone),
          addressLine1: address1.trim(),
          addressLine2: address2.trim() || undefined,
          landmark: landmark.trim() || undefined,
          city: city.trim(),
          state: state.trim(),
          pinCode: normalizePin(pinCode),
          country: 'India',
        },
      });
      router.back();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not save address.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Saved address', headerShadowVisible: false }} />
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
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.lead}>
              Used at checkout for handmade product orders. You can update it anytime.
            </Text>

            <Field label="Recipient name" value={fullName} onChangeText={setFullName} autoCapitalize="words" />
            <Field
              label="Phone"
              value={phone}
              onChangeText={(value) => setPhone(normalizePhone(value))}
              keyboardType="phone-pad"
              maxLength={10}
              placeholder="10-digit mobile"
            />
            <Field label="Address line 1" value={address1} onChangeText={setAddress1} placeholder="House / street" />
            <Field
              label="Address line 2"
              optional
              value={address2}
              onChangeText={setAddress2}
              placeholder="Apartment, floor"
            />
            <Field label="Landmark" optional value={landmark} onChangeText={setLandmark} placeholder="Near…" />
            <View style={styles.row}>
              <Field
                label="City"
                style={styles.half}
                value={city}
                onChangeText={setCity}
                autoCapitalize="words"
                placeholder="Coimbatore"
              />
              <Field
                label="PIN"
                style={styles.half}
                value={pinCode}
                onChangeText={(value) => setPinCode(normalizePin(value))}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="641001"
              />
            </View>
            <Field
              label="State"
              value={state}
              onChangeText={setState}
              autoCapitalize="words"
              placeholder="Tamil Nadu"
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
  style,
  ...inputProps
}: {
  label: string;
  optional?: boolean;
  style?: object;
} & ComponentProps<typeof TextInput>) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>
        {label}
        {optional ? <Text style={styles.optional}> · optional</Text> : null}
      </Text>
      <TextInput
        {...inputProps}
        placeholderTextColor={colors.muted}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.cream },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: 14,
  },
  lead: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
    marginBottom: 4,
  },
  field: { gap: 6 },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
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
  input: {
    borderWidth: 1,
    borderColor: colors.softBorder,
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.ink,
  },
  error: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.danger,
    lineHeight: 18,
  },
  saveBtn: {
    marginTop: 8,
    backgroundColor: colors.pink,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveText: {
    fontFamily: fonts.extraBold,
    fontSize: 15,
    color: colors.white,
  },
});
