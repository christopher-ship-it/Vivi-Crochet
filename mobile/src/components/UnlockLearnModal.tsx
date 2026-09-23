import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type KeyboardEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLearningCustomer, useShoppingSession } from '../auth/SessionContext';
import type { LearningCustomerProfile } from '../auth/storage';
import { ApiClientError } from '../api/client';
import {
  confirmEmailVerification,
  getMyProfile,
  requestEmailVerification,
  updateMyProfile,
} from '../api/me';
import { useI18n } from '../i18n';
import { uiFonts, type UiFonts } from '../i18n/uiFonts';
import { colors, radii, spacing } from '../theme';
import {
  isIndiaAccount,
  isSyntheticEmail,
  isUsableCustomerEmail,
  isValidName,
  isValidPhone,
  normalizePhone,
  phoneFromCustomerLoginEmail,
  realCustomerName,
  sanitizeEmail,
} from '../utils/validation';

interface UnlockLearnModalProps {
  visible: boolean;
  courseName: string;
  /** When true, send a verification code as soon as the sheet opens (authenticated, unverified). */
  autoSendCode?: boolean;
  onContinue: () => void;
  onDismiss: () => void;
  /** Called when the shopping session is no longer valid for customer APIs. */
  onSessionExpired?: () => void;
}

export function UnlockLearnModal({
  visible,
  courseName,
  autoSendCode = false,
  onContinue,
  onDismiss,
  onSessionExpired,
}: UnlockLearnModalProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { t, language } = useI18n();
  const fonts = uiFonts(language);
  const styles = useMemo(() => createStyles(fonts), [language]);
  const { profile, saveProfile } = useLearningCustomer();
  const { isAuthenticated, user } = useShoppingSession();
  const scrollRef = useRef<ScrollView>(null);
  const emailY = useRef(0);
  const otpY = useRef(0);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [requireIndianPhone, setRequireIndianPhone] = useState(true);
  const [emailAlreadyVerified, setEmailAlreadyVerified] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [saving, setSaving] = useState(false);
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

    let cancelled = false;

    async function hydrate() {
      setLoadingProfile(true);
      setVerificationCode('');
      setCodeSent(false);
      setError(null);
      setSaving(false);
      setSendingCode(false);
      setConfirmingCode(false);

      let nextName = realCustomerName(profile?.fullName, user?.name);
      let nextPhone = normalizePhone(
        profile?.phone || user?.phone || phoneFromCustomerLoginEmail(user?.email) || '',
      );
      let nextEmail = isUsableCustomerEmail(profile?.email) ? sanitizeEmail(profile?.email) : '';
      let verified = false;
      let nextRequireIndianPhone = Boolean(phoneFromCustomerLoginEmail(user?.email))
        || isSyntheticEmail(user?.email);

      if (isAuthenticated) {
        try {
          const server = await getMyProfile();
          if (cancelled) return;
          nextName = realCustomerName(server.fullName, nextName, user?.name);
          nextPhone =
            normalizePhone(server.phoneNumber)
            || nextPhone
            || normalizePhone(user?.phone || '');
          nextRequireIndianPhone = isIndiaAccount({
            authMethod: server.authMethod,
            country: server.country,
          });
          const serverEmail = sanitizeEmail(server.email);
          if (isUsableCustomerEmail(serverEmail)) {
            nextEmail = serverEmail;
            verified = Boolean(server.isEmailVerified);
          } else if (!nextEmail && !isSyntheticEmail(serverEmail)) {
            nextEmail = '';
          }

          if (verified && nextEmail) {
            await saveProfile({
              fullName: nextName,
              phone: nextRequireIndianPhone ? nextPhone : (nextPhone || ''),
              email: nextEmail,
            });
          }
        } catch (err) {
          if (cancelled) return;
          if (
            err instanceof ApiClientError
            && (err.code === 'SESSION_INVALID' || err.code === 'UNAUTHORIZED' || err.code === 'CUSTOMER_ONLY')
          ) {
            onDismiss();
            onSessionExpired?.();
            return;
          }
          // Fall back to local learning profile / session.
        }
      }

      if (cancelled) return;

      setFullName(nextName);
      setPhone(nextPhone);
      setEmail(nextEmail);
      setRequireIndianPhone(nextRequireIndianPhone);
      setEmailAlreadyVerified(verified);
      setInfo(
        verified
          ? t('unlockLearn.emailVerifiedConfirm')
          : isAuthenticated
            ? t('unlockLearn.emailCodeBeforeCheckout')
            : null,
      );
      setLoadingProfile(false);

      if (
        autoSendCode
        && !autoSentForOpen.current
        && isAuthenticated
        && !verified
        && isValidName(nextName)
        && (!nextRequireIndianPhone || isValidPhone(nextPhone))
        && isUsableCustomerEmail(nextEmail)
      ) {
        autoSentForOpen.current = true;
        await handleSendCode(nextEmail);
        if (cancelled) return;
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [
    visible,
    autoSendCode,
    isAuthenticated,
    profile?.fullName,
    profile?.phone,
    profile?.email,
    user?.name,
    user?.phone,
    user?.email,
    saveProfile,
  ]);

  useEffect(() => {
    if (!visible) {
      setKeyboardHeight(0);
      return;
    }
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
  }, [visible]);

  /** Keep email/OTP visible in the sheet above the keyboard. */
  function revealField(y: number) {
    requestAnimationFrame(() => {
      setTimeout(() => {
        scrollRef.current?.scrollTo({
          y: Math.max(0, y - 28),
          animated: true,
        });
      }, Platform.OS === 'ios' ? 60 : 120);
    });
  }

  function onEmailChange(value: string) {
    setEmail(value);
    setEmailAlreadyVerified(false);
    setCodeSent(false);
    setVerificationCode('');
    setError(null);
    if (
      info?.startsWith(t('emailVerify.codeSentPrefix'))
      || info?.startsWith(t('unlockLearn.emailVerifiedConfirm').slice(0, 12))
    ) {
      setInfo(null);
    }
  }

  async function persistLocalProfile(payload: LearningCustomerProfile) {
    await saveProfile(payload);
  }

  async function handleSendCode(nextEmail: string) {
    if (sendCodeInFlight.current) return;
    sendCodeInFlight.current = true;
    setSendingCode(true);
    setError(null);
    try {
      const response = await requestEmailVerification(nextEmail);
      setCodeSent(true);
      setInfo(response.message || t('emailVerify.codeSentDefault'));
    } catch (err) {
      if (
        err instanceof ApiClientError
        && (err.code === 'SESSION_INVALID' || err.code === 'UNAUTHORIZED' || err.code === 'CUSTOMER_ONLY')
      ) {
        setError('Please sign in again with your phone number, then continue.');
        onDismiss();
        onSessionExpired?.();
        return;
      }
      setError(
        err instanceof ApiClientError ? err.message : 'Could not send the verification code.',
      );
    } finally {
      sendCodeInFlight.current = false;
      setSendingCode(false);
    }
  }

  async function finishWithProfile(payload: LearningCustomerProfile, alreadyVerified: boolean) {
    await persistLocalProfile(payload);
    if (isAuthenticated) {
      try {
        await updateMyProfile({
          fullName: payload.fullName,
          ...(alreadyVerified ? { email: payload.email } : {}),
        });
      } catch (err) {
        if (
          alreadyVerified
          && err instanceof ApiClientError
          && err.code === 'EMAIL_VERIFICATION_REQUIRED'
        ) {
          setEmailAlreadyVerified(false);
          await handleSendCode(payload.email);
          return;
        }
        if (!(err instanceof ApiClientError && err.code === 'EMAIL_VERIFICATION_REQUIRED')) {
          // Local profile is enough to continue; checkout retries sync.
        }
      }
    }
    onContinue();
  }

  async function handleSubmit() {
    setError(null);
    if (!isValidName(fullName)) {
      setError(t('unlockLearn.enterFullName'));
      return;
    }
    if (requireIndianPhone && !isValidPhone(phone)) {
      setError(t('unlockLearn.enterValidMobile'));
      return;
    }
    const nextEmail = sanitizeEmail(email);
    if (!isUsableCustomerEmail(nextEmail)) {
      setError(t('validation.email'));
      return;
    }
    setEmail(nextEmail);

    const payload: LearningCustomerProfile = {
      fullName: fullName.trim(),
      phone: requireIndianPhone ? normalizePhone(phone) : normalizePhone(phone) || '',
      email: nextEmail,
    };

    setSaving(true);
    try {
      if (!isAuthenticated) {
        await persistLocalProfile(payload);
        onContinue();
        return;
      }

      if (emailAlreadyVerified) {
        await finishWithProfile(payload, true);
        return;
      }

      await persistLocalProfile(payload);
      await handleSendCode(nextEmail);
    } catch {
      setError(t('unlockLearn.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmCode() {
    const nextEmail = sanitizeEmail(email);
    const code = verificationCode.trim();
    if (!isUsableCustomerEmail(nextEmail)) {
      setError(t('validation.email'));
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setError(t('unlockLearn.enterEmailCode'));
      return;
    }

    setConfirmingCode(true);
    setError(null);
    try {
      const updated = await confirmEmailVerification({ email: nextEmail, code });
      const savedEmail = sanitizeEmail(updated.email || nextEmail);
      const payload: LearningCustomerProfile = {
        fullName: fullName.trim() || updated.fullName,
        phone: normalizePhone(phone) || updated.phoneNumber || '',
        email: savedEmail,
      };
      setEmail(savedEmail);
      setEmailAlreadyVerified(true);
      setCodeSent(false);
      setVerificationCode('');
      setInfo(t('unlockLearn.emailVerifiedContinuing'));
      await finishWithProfile(payload, true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('unlockLearn.verifyEmailFailed'));
    } finally {
      setConfirmingCode(false);
    }
  }

  const busy = loadingProfile || saving || sendingCode || confirmingCode;
  const showOtp = isAuthenticated && codeSent && !emailAlreadyVerified;
  const emailLocked =
    isUsableCustomerEmail(email)
    && (!requireIndianPhone || emailAlreadyVerified);
  const bottomPad = Math.max(insets.bottom, 12) + 20;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <View style={styles.shell}>
        <Pressable style={styles.backdropTap} onPress={onDismiss} accessibilityRole="button" />
        <View
          style={[
            styles.sheet,
            {
              // Sit just above the keyboard, lower than full keyboard height.
              marginBottom: keyboardHeight > 0 ? Math.max(0, keyboardHeight - 100) : 0,
              maxHeight: Math.min(windowHeight * 0.92, windowHeight - Math.max(keyboardHeight - 100, 0) - 8),
            },
          ]}
        >
          <ScrollView
            ref={scrollRef}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad }]}
          >
              <View style={styles.handle} />
              <Text style={styles.eyebrow}>{t('unlockLearn.learnEyebrow')}</Text>
              <Text style={styles.title}>{t('unlockLearn.classTitle')}</Text>
              {!isAuthenticated ? (
                <>
                  <Text style={styles.body}>
                    {t('unlockLearn.classBody', { courseName })}
                  </Text>
                  <Pressable
                    style={styles.primaryBtn}
                    onPress={() => {
                      onDismiss();
                      onContinue();
                    }}
                  >
                    <Text style={styles.primaryText}>{t('unlockLearn.signInCreate')}</Text>
                  </Pressable>
                  <Pressable style={styles.secondaryBtn} onPress={onDismiss}>
                    <Text style={styles.secondaryText}>{t('auth.notNow')}</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.body}>{t('unlockLearn.authBody', { courseName })}</Text>

                  {error ? <Text style={styles.error}>{error}</Text> : null}
                  {info ? <Text style={styles.info}>{info}</Text> : null}

                  <Text style={styles.label}>{t('auth.fullName')}</Text>
                  <TextInput
                    style={styles.input}
                    value={fullName}
                    onChangeText={(value) => {
                      setFullName(value);
                      setError(null);
                    }}
                    placeholder={t('auth.yourName')}
                    placeholderTextColor={colors.muted}
                    autoCapitalize="words"
                    editable={!busy}
                  />

                  {requireIndianPhone ? (
                    <>
                      <Text style={styles.label}>{t('unlockLearn.phoneNumber')}</Text>
                      <TextInput
                        style={styles.input}
                        value={phone}
                        onChangeText={(value) => {
                          setPhone(value);
                          setError(null);
                        }}
                        placeholder="9876543210"
                        placeholderTextColor={colors.muted}
                        keyboardType="phone-pad"
                        maxLength={10}
                        editable={!busy}
                      />
                    </>
                  ) : null}

                  <View
                    onLayout={(e) => {
                      emailY.current = e.nativeEvent.layout.y;
                    }}
                  >
                    <Text style={styles.label}>{t('unlockLearn.emailAddress')}</Text>
                    <TextInput
                      style={[styles.input, emailLocked && styles.inputReadonly]}
                      value={email}
                      onChangeText={onEmailChange}
                      placeholder="you@example.com"
                      placeholderTextColor={colors.muted}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!busy && !emailLocked}
                      selectTextOnFocus={!emailLocked}
                      onFocus={() => {
                        if (!emailLocked) revealField(emailY.current);
                      }}
                    />
                    {emailAlreadyVerified ? (
                      <Text style={styles.verified}>{t('unlockLearn.verified')}</Text>
                    ) : emailLocked ? (
                      <Text style={styles.lockedHint}>{t('unlockLearn.emailFromAccount')}</Text>
                    ) : null}
                  </View>

                  {showOtp ? (
                    <>
                      <View
                        onLayout={(e) => {
                          otpY.current = e.nativeEvent.layout.y;
                        }}
                      >
                        <Text style={styles.label}>{t('unlockLearn.verificationCode')}</Text>
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
                          onFocus={() => revealField(otpY.current)}
                        />
                      </View>
                      <Pressable
                        style={[styles.primaryBtn, busy && styles.btnDisabled]}
                        onPress={() => void handleConfirmCode()}
                        disabled={busy}
                      >
                        <Text style={styles.primaryText}>
                          {confirmingCode
                            ? t('unlockLearn.verifying')
                            : t('unlockLearn.verifyContinue')}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={styles.secondaryBtn}
                        onPress={() => void handleSendCode(sanitizeEmail(email))}
                        disabled={busy}
                      >
                        <Text style={styles.secondaryText}>
                          {sendingCode
                            ? t('unlockLearn.sendingCode')
                            : t('unlockLearn.resendCode')}
                        </Text>
                      </Pressable>
                    </>
                  ) : (
                    <Pressable
                      style={[styles.primaryBtn, busy && styles.btnDisabled]}
                      onPress={() => void handleSubmit()}
                      disabled={busy}
                    >
                      <Text style={styles.primaryText}>
                        {loadingProfile
                          ? t('common.loading')
                          : saving || sendingCode
                            ? emailAlreadyVerified
                              ? t('unlockLearn.continuing')
                              : isAuthenticated
                                ? t('unlockLearn.sendingCode')
                                : t('unlockLearn.saving')
                            : emailAlreadyVerified
                              ? t('unlockLearn.continueArrow')
                              : isAuthenticated
                                ? t('unlockLearn.continueSendCode')
                                : t('unlockLearn.continueArrow')}
                      </Text>
                    </Pressable>
                  )}

                  <Pressable
                    style={[styles.secondaryBtn, styles.secondaryBtnCompact]}
                    onPress={onDismiss}
                    disabled={busy}
                  >
                    <Text style={styles.secondaryText}>{t('auth.notNow')}</Text>
                  </Pressable>
                </>
              )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(fonts: UiFonts) {
  return StyleSheet.create({
    shell: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(24,14,18,0.5)',
    },
    backdropTap: {
      ...StyleSheet.absoluteFillObject,
    },
    sheet: {
      backgroundColor: colors.white,
      borderTopWidth: 2,
      borderTopColor: colors.border,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      zIndex: 1,
    },
    scrollContent: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      backgroundColor: colors.border,
      marginBottom: spacing.md,
      opacity: 0.3,
    },
    eyebrow: {
      fontFamily: fonts.extraBold,
      fontSize: 10,
      letterSpacing: 2,
      color: colors.pink,
    },
    title: {
      fontFamily: fonts.extraBold,
      fontSize: 20,
      color: colors.ink,
      marginTop: 6,
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
    inputReadonly: {
      backgroundColor: colors.mediaWash,
      color: colors.muted,
    },
    lockedHint: {
      marginTop: 6,
      fontFamily: fonts.regular,
      fontSize: 12,
      color: colors.muted,
    },
    verified: {
      marginTop: 6,
      fontFamily: fonts.semiBold,
      fontSize: 12,
      color: colors.success,
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
      paddingVertical: 10,
      alignItems: 'center',
    },
    secondaryBtnCompact: {
      marginTop: 2,
      paddingVertical: 6,
    },
    secondaryText: {
      fontFamily: fonts.semiBold,
      fontSize: 13,
      color: colors.muted,
    },
  });
}
