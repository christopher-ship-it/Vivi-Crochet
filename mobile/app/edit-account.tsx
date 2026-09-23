import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
  type KeyboardEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClientError } from '../src/api/client';
import {
  confirmEmailVerification,
  getMyProfile,
  requestEmailVerification,
  updateMyProfile,
} from '../src/api/me';
import { useLearningCustomer, useShoppingSession } from '../src/auth/SessionContext';
import {
  composeInternationalPhone,
  DIAL_CODE_OPTIONS,
  dialCodeForCountry,
  isValidInternationalPhone,
  splitInternationalPhone,
  type DialCodeOption,
} from '../src/data/dialCodes';
import { colors, fonts, spacing } from '../src/theme';
import {
  isIndiaAccount,
  isValidEmail,
  isValidPhone,
  normalizePhone,
  realCustomerName,
} from '../src/utils/validation';

function isSyntheticEmail(email: string | null | undefined): boolean {
  return Boolean(email?.toLowerCase().endsWith('@vivicrochet.dev'));
}

export default function EditAccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, isAuthenticated } = useShoppingSession();
  const { saveProfile: saveLearningProfile } = useLearningCustomer();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [confirmingCode, setConfirmingCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [authMethod, setAuthMethod] = useState<string>('PhoneOtp');
  const [accountCountry, setAccountCountry] = useState<string | null>(null);
  const [fullName, setFullName] = useState(() => realCustomerName(user?.name));
  const [email, setEmail] = useState('');
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [phone, setPhone] = useState('');
  const [dialCode, setDialCode] = useState('91');
  const [dialPickerOpen, setDialPickerOpen] = useState(false);
  const [dialQuery, setDialQuery] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const indiaAccount = isIndiaAccount({ authMethod, country: accountCountry });
  const emailNormalized = email.trim().toLowerCase();
  const emailNeedsVerification =
    Boolean(emailNormalized) &&
    (!isEmailVerified || emailNormalized !== verifiedEmail.toLowerCase());

  const filteredDialOptions = useMemo(() => {
    const q = dialQuery.trim().toLowerCase();
    if (!q) return DIAL_CODE_OPTIONS;
    return DIAL_CODE_OPTIONS.filter(
      (option) =>
        option.country.toLowerCase().includes(q) ||
        option.dial.includes(q.replace(/^\+/, '')) ||
        option.label.toLowerCase().includes(q),
    );
  }, [dialQuery]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e: KeyboardEvent) => {
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace({ pathname: '/login', params: { returnTo: '/edit-account' } });
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const profile = await getMyProfile();
        if (cancelled) return;
        const profileEmail = isSyntheticEmail(profile.email) ? '' : profile.email;
        const method = profile.authMethod || 'PhoneOtp';
        const country = profile.country ?? null;
        setAuthMethod(method);
        setAccountCountry(country);
        setFullName(realCustomerName(profile.fullName, user?.name) || '');
        setEmail(profileEmail);
        setVerifiedEmail(profile.isEmailVerified ? profileEmail : '');
        setIsEmailVerified(Boolean(profile.isEmailVerified));
        setCodeSent(false);
        setVerificationCode('');

        const rawPhone = profile.phoneNumber || user?.phone || '';
        if (isIndiaAccount({ authMethod: method, country })) {
          setDialCode('91');
          setPhone(normalizePhone(rawPhone));
        } else {
          const preferred = dialCodeForCountry(country);
          const split = splitInternationalPhone(rawPhone, preferred);
          setDialCode(split.dial || preferred || '');
          setPhone(split.national);
        }

        if (isSyntheticEmail(profile.email) || !profileEmail) {
          setInfo('Add and verify a real email for order updates.');
        } else if (!profile.isEmailVerified) {
          setInfo('Verify this email with a 6-digit code so we know you own the inbox.');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Could not load your account.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, router, user?.name, user?.phone]);

  function onEmailChange(value: string) {
    setEmail(value);
    setCodeSent(false);
    setVerificationCode('');
    setError(null);
    if (info?.startsWith('We sent')) setInfo(null);
  }

  function selectDialCode(option: DialCodeOption) {
    setDialCode(option.dial);
    setDialPickerOpen(false);
    setDialQuery('');
  }

  async function handleSendCode() {
    if (sendingCode) return;
    const nextEmail = email.trim();
    if (!nextEmail || !isValidEmail(nextEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    setSendingCode(true);
    setError(null);
    setInfo(null);
    try {
      const response = await requestEmailVerification(nextEmail);
      setCodeSent(true);
      setInfo(response.message || 'We sent a verification code to that email.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not send the verification code.');
    } finally {
      setSendingCode(false);
    }
  }

  async function handleConfirmCode() {
    const nextEmail = email.trim();
    const code = verificationCode.trim();
    if (!nextEmail || !isValidEmail(nextEmail)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from your email.');
      return;
    }

    setConfirmingCode(true);
    setError(null);
    setInfo(null);
    try {
      const updated = await confirmEmailVerification({ email: nextEmail, code });
      const saved = isSyntheticEmail(updated.email) ? '' : updated.email;
      setEmail(saved);
      setVerifiedEmail(updated.isEmailVerified ? saved : '');
      setIsEmailVerified(Boolean(updated.isEmailVerified));
      setCodeSent(false);
      setVerificationCode('');
      setInfo('Email verified.');
      await saveLearningProfile({
        fullName: updated.fullName,
        phone: updated.phoneNumber || '',
        email: saved,
      });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not verify your email.');
    } finally {
      setConfirmingCode(false);
    }
  }

  async function handleSave() {
    const name = fullName.trim();
    if (!name) {
      setError('Please enter your name.');
      return;
    }

    let phoneNumber: string | undefined;
    if (indiaAccount) {
      const digits = normalizePhone(phone);
      if (digits && !isValidPhone(digits)) {
        setError('Please enter a valid 10-digit mobile number.');
        return;
      }
      if (authMethod === 'PhoneOtp' && !digits) {
        setError('Phone number is required for India accounts.');
        return;
      }
      phoneNumber = digits || undefined;
    } else {
      const national = phone.replace(/\D/g, '');
      if (national) {
        if (!dialCode) {
          setError('Please select a country calling code.');
          return;
        }
        if (!isValidInternationalPhone(dialCode, national)) {
          setError('Please enter a valid phone number for the selected country code.');
          return;
        }
        phoneNumber = composeInternationalPhone(dialCode, national);
      }
    }

    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const updated = await updateMyProfile({
        fullName: name,
        phoneNumber,
      });
      await saveLearningProfile({
        fullName: updated.fullName,
        phone: updated.phoneNumber || '',
        email: isSyntheticEmail(updated.email) ? '' : updated.email,
      });
      router.back();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not save your account.');
    } finally {
      setSaving(false);
    }
  }

  const busy = saving || sendingCode || confirmingCode;

  return (
    <>
      <Stack.Screen options={{ title: 'My profile', headerBackTitle: 'Back' }} />
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.pink} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[
              styles.content,
              {
                paddingTop: spacing.md,
                paddingBottom: Math.max(insets.bottom, 12) + 48 + keyboardHeight,
              },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets
          >
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {info ? <Text style={styles.info}>{info}</Text> : null}

            <Text style={styles.label}>Full name</Text>
            <TextInput
              style={styles.input}
              value={fullName}
              onChangeText={setFullName}
              placeholder="Your name"
              placeholderTextColor={colors.muted}
              autoCapitalize="words"
            />

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={onEmailChange}
              placeholder="you@example.com"
              placeholderTextColor={colors.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {isEmailVerified && !emailNeedsVerification ? (
              <Text style={styles.verified}>Verified</Text>
            ) : (
              <Text style={styles.hint}>
                {authMethod === 'EmailPassword'
                  ? 'We email a 6-digit code to confirm you own this inbox (also used to sign in).'
                  : 'We email a 6-digit code to confirm you own this inbox for order updates.'}
              </Text>
            )}

            {emailNeedsVerification ? (
              <>
                <Pressable
                  style={[styles.secondaryBtn, busy && styles.buttonDisabled]}
                  onPress={() => void handleSendCode()}
                  disabled={busy}
                >
                  <Text style={styles.secondaryBtnText}>
                    {sendingCode ? 'Sending code…' : codeSent ? 'Resend code' : 'Send verification code'}
                  </Text>
                </Pressable>

                {codeSent ? (
                  <>
                    <Text style={styles.label}>Verification code</Text>
                    <TextInput
                      style={styles.input}
                      value={verificationCode}
                      onChangeText={setVerificationCode}
                      placeholder="6-digit code"
                      placeholderTextColor={colors.muted}
                      keyboardType="number-pad"
                      maxLength={6}
                    />
                    <Pressable
                      style={[styles.button, styles.verifyButton, busy && styles.buttonDisabled]}
                      onPress={() => void handleConfirmCode()}
                      disabled={busy}
                    >
                      <Text style={styles.buttonText}>
                        {confirmingCode ? 'Verifying…' : 'Confirm email'}
                      </Text>
                    </Pressable>
                  </>
                ) : null}
              </>
            ) : null}

            <Text style={styles.label}>Phone</Text>
            <View style={styles.phoneRow}>
              {indiaAccount ? (
                <View style={styles.prefix}>
                  <Text style={styles.prefixText}>+91</Text>
                </View>
              ) : (
                <Pressable
                  style={styles.prefixButton}
                  onPress={() => {
                    setDialQuery('');
                    setDialPickerOpen(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Country calling code"
                  disabled={busy}
                >
                  <Text style={styles.prefixText}>{dialCode ? `+${dialCode}` : 'Code'}</Text>
                  <Ionicons name="chevron-down" size={14} color={colors.muted} />
                </Pressable>
              )}
              <TextInput
                style={[styles.input, styles.phoneInput]}
                value={phone}
                onChangeText={(value) =>
                  setPhone(indiaAccount ? normalizePhone(value) : value.replace(/[^\d]/g, '').slice(0, 15))
                }
                placeholder={indiaAccount ? '9876543210' : 'Phone number'}
                placeholderTextColor={colors.muted}
                keyboardType="phone-pad"
                maxLength={indiaAccount ? 10 : 15}
              />
            </View>
            <Text style={styles.hint}>
              {indiaAccount
                ? authMethod === 'PhoneOtp'
                  ? 'Changing phone updates your India sign-in number.'
                  : 'Optional contact number for delivery updates.'
                : 'Optional. Pick your country code, then enter the local number.'}
            </Text>

            <Pressable
              style={[styles.button, busy && styles.buttonDisabled]}
              onPress={() => void handleSave()}
              disabled={busy}
            >
              <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Save account'}</Text>
            </Pressable>
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      <Modal
        visible={dialPickerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDialPickerOpen(false)}
      >
        <View style={[styles.modalRoot, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Country code</Text>
            <Pressable
              onPress={() => setDialPickerOpen(false)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={24} color={colors.ink} />
            </Pressable>
          </View>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput
              style={styles.searchInput}
              value={dialQuery}
              onChangeText={setDialQuery}
              placeholder="Search country or code"
              placeholderTextColor={colors.muted}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>
          <FlatList
            data={filteredDialOptions}
            keyExtractor={(item) => `${item.dial}-${item.country}`}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const selected = item.dial === dialCode;
              return (
                <Pressable
                  style={[styles.optionRow, selected && styles.optionRowSelected]}
                  onPress={() => selectDialCode(item)}
                >
                  <Text style={styles.optionDial}>+{item.dial}</Text>
                  <Text style={styles.optionCountry}>{item.country}</Text>
                  {selected ? <Ionicons name="checkmark" size={18} color={colors.pink} /> : null}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.white,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: spacing.lg,
  },
  label: {
    marginTop: spacing.md,
    marginBottom: 6,
    fontFamily: fonts.semiBold,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.softBorder,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.white,
  },
  phoneRow: {
    flexDirection: 'row',
    gap: 8,
  },
  prefix: {
    borderWidth: 1,
    borderColor: colors.softBorder,
    borderRadius: 14,
    paddingHorizontal: 14,
    justifyContent: 'center',
    backgroundColor: colors.pinkSoft,
  },
  prefixButton: {
    borderWidth: 1,
    borderColor: colors.softBorder,
    borderRadius: 14,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.pinkSoft,
    minWidth: 72,
  },
  prefixText: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: colors.ink,
  },
  phoneInput: {
    flex: 1,
  },
  hint: {
    marginTop: 6,
    marginBottom: 4,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17,
  },
  verified: {
    marginTop: 6,
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.pink,
  },
  secondaryBtn: {
    marginTop: spacing.lg,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: colors.pink,
  },
  secondaryBtnText: {
    fontFamily: fonts.extraBold,
    color: colors.white,
    fontSize: 14,
  },
  button: {
    marginTop: spacing.xl,
    backgroundColor: colors.pink,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  verifyButton: {
    marginTop: spacing.md,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontFamily: fonts.extraBold,
    color: colors.white,
    fontSize: 14,
  },
  error: {
    fontFamily: fonts.semiBold,
    color: colors.danger,
    fontSize: 13,
    marginBottom: 8,
    lineHeight: 18,
  },
  info: {
    fontFamily: fonts.semiBold,
    color: colors.pink,
    fontSize: 13,
    marginBottom: 8,
    lineHeight: 18,
  },
  modalRoot: {
    flex: 1,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  modalTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 18,
    color: colors.ink,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.softBorder,
    borderRadius: 14,
    paddingHorizontal: 12,
    marginBottom: spacing.sm,
    backgroundColor: colors.cream,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.ink,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.softBorder,
  },
  optionRowSelected: {
    backgroundColor: colors.pinkSoft,
    marginHorizontal: -8,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  optionDial: {
    width: 56,
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: colors.ink,
  },
  optionCountry: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.ink,
  },
});
