import { useEffect, useMemo, useRef, useState } from 'react';
import {
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
import { ApiClientError } from '../api/client';
import {
  confirmEmailVerification,
  requestEmailVerification,
} from '../api/me';
import { useLearningCustomer } from '../auth/SessionContext';
import { useI18n } from '../i18n';
import { uiFonts, type UiFonts } from '../i18n/uiFonts';
import { colors, radii, spacing } from '../theme';
import {
  isUsableCustomerEmail,
  isValidEmail,
  sanitizeEmail,
} from '../utils/validation';

interface EmailVerifySheetProps {
  visible: boolean;
  title?: string;
  body?: string;
  initialEmail?: string;
  autoSendCode?: boolean;
  onVerified: (email: string) => void;
  onDismiss: () => void;
}

export function EmailVerifySheet({
  visible,
  title,
  body,
  initialEmail = '',
  autoSendCode = false,
  onVerified,
  onDismiss,
}: EmailVerifySheetProps) {
  const insets = useSafeAreaInsets();
  const { t, language } = useI18n();
  const fonts = uiFonts(language);
  const styles = useMemo(() => createStyles(fonts), [language]);
  const sheetTitle = title ?? t('emailVerify.addEmailTitle');
  const sheetBody = body ?? t('emailVerify.defaultBody');
  const { profile, saveProfile } = useLearningCustomer();
  const [email, setEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [sendingCode, setSendingCode] = useState(false);
  const [confirmingCode, setConfirmingCode] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const sendCodeInFlight = useRef(false);
  const autoSentForOpen = useRef(false);

  useEffect(() => {
    if (!visible) {
      autoSentForOpen.current = false;
      return;
    }
    const nextEmail = sanitizeEmail(initialEmail || profile?.email || '');
    setEmail(isUsableCustomerEmail(nextEmail) ? nextEmail : '');
    setVerificationCode('');
    setCodeSent(false);
    setError(null);
    setInfo(null);
    setSendingCode(false);
    setConfirmingCode(false);

    if (
      autoSendCode
      && !autoSentForOpen.current
      && isUsableCustomerEmail(nextEmail)
    ) {
      autoSentForOpen.current = true;
      void sendCode(nextEmail);
    }
  }, [visible, autoSendCode, initialEmail, profile?.email]);

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

  async function sendCode(nextEmail: string) {
    if (sendCodeInFlight.current) return;
    sendCodeInFlight.current = true;
    setSendingCode(true);
    setError(null);
    try {
      const response = await requestEmailVerification(nextEmail);
      setCodeSent(true);
      setInfo(response.message || t('emailVerify.codeSentDefault'));
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : t('emailVerify.sendCodeFailed'),
      );
    } finally {
      sendCodeInFlight.current = false;
      setSendingCode(false);
    }
  }

  async function handleSendCode() {
    const nextEmail = sanitizeEmail(email);
    if (!isValidEmail(nextEmail) || !isUsableCustomerEmail(nextEmail)) {
      setError(t('emailVerify.emailValidBooking'));
      return;
    }
    setEmail(nextEmail);
    await sendCode(nextEmail);
  }

  async function handleConfirmCode() {
    const nextEmail = sanitizeEmail(email);
    const code = verificationCode.trim();
    if (!isUsableCustomerEmail(nextEmail)) {
      setError(t('emailVerify.emailValidBooking'));
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setError(t('emailVerify.enterEmailCode'));
      return;
    }

    setConfirmingCode(true);
    setError(null);
    try {
      const updated = await confirmEmailVerification({ email: nextEmail, code });
      const saved = sanitizeEmail(updated.email || nextEmail);
      await saveProfile({
        fullName: updated.fullName || profile?.fullName || '',
        phone: updated.phoneNumber || profile?.phone || '',
        email: saved,
      });
      setCodeSent(false);
      setVerificationCode('');
      onVerified(saved);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('emailVerify.verifyEmailFailed'));
    } finally {
      setConfirmingCode(false);
    }
  }

  const busy = sendingCode || confirmingCode;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onDismiss}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              automaticallyAdjustKeyboardInsets
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                paddingBottom: Math.max(insets.bottom, 12) + 48 + keyboardHeight,
              }}
            >
              <View style={styles.handle} />
              <Text style={styles.title}>{sheetTitle}</Text>
              <Text style={styles.body}>{sheetBody}</Text>

              {error ? <Text style={styles.error}>{error}</Text> : null}
              {info ? <Text style={styles.info}>{info}</Text> : null}

              <Text style={styles.label}>{t('emailVerify.emailAddress')}</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  setCodeSent(false);
                  setVerificationCode('');
                  setError(null);
                  if (info?.startsWith(t('emailVerify.codeSentPrefix'))) setInfo(null);
                }}
                placeholder="you@example.com"
                placeholderTextColor={colors.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
                autoFocus
              />

              {codeSent ? (
                <>
                  <Text style={styles.label}>{t('emailVerify.verificationCode')}</Text>
                  <TextInput
                    style={styles.input}
                    value={verificationCode}
                    onChangeText={(value) => {
                      setVerificationCode(value.replace(/\D/g, '').slice(0, 6));
                      setError(null);
                    }}
                    placeholder={t('auth.sixDigit')}
                    placeholderTextColor={colors.muted}
                    keyboardType="number-pad"
                    maxLength={6}
                    editable={!busy}
                  />
                  <Pressable
                    style={[styles.primaryBtn, busy && styles.btnDisabled]}
                    onPress={() => void handleConfirmCode()}
                    disabled={busy}
                  >
                    <Text style={styles.primaryText}>
                      {confirmingCode ? t('emailVerify.verifying') : t('emailVerify.verifyContinue')}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={styles.secondaryBtn}
                    onPress={() => void handleSendCode()}
                    disabled={busy}
                  >
                    <Text style={styles.secondaryText}>
                      {sendingCode ? t('emailVerify.sendingCode') : t('emailVerify.resendCode')}
                    </Text>
                  </Pressable>
                </>
              ) : (
                <Pressable
                  style={[styles.primaryBtn, busy && styles.btnDisabled]}
                  onPress={() => void handleSendCode()}
                  disabled={busy}
                >
                  <Text style={styles.primaryText}>
                    {sendingCode ? t('emailVerify.sendingCode') : t('emailVerify.sendVerificationCode')}
                  </Text>
                </Pressable>
              )}

              <Pressable style={styles.secondaryBtn} onPress={onDismiss} disabled={busy}>
                <Text style={styles.secondaryText}>{t('emailVerify.notNow')}</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(fonts: UiFonts) {
  return StyleSheet.create({
  flex: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(24,14,18,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 2,
    borderTopColor: colors.border,
    maxHeight: '92%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
    opacity: 0.3,
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 20,
    color: colors.ink,
    lineHeight: 26,
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 20,
    marginTop: 10,
    marginBottom: spacing.md,
  },
  label: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: colors.muted,
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.softBorder,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.ink,
  },
  error: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.danger,
    marginBottom: 4,
  },
  info: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.ink,
    lineHeight: 18,
    marginBottom: 4,
    backgroundColor: '#fff3cf',
    borderWidth: 1,
    borderColor: colors.softBorder,
    borderRadius: radii.md,
    padding: 12,
  },
  primaryBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.pink,
    borderRadius: radii.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  primaryText: {
    fontFamily: fonts.extraBold,
    fontSize: 14,
    color: colors.white,
  },
  secondaryBtn: {
    marginTop: spacing.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.muted,
  },
  });
}
