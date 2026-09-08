import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Image,
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
import { requestMobileOtp, verifyMobileOtp } from '../src/api/auth';
import { ApiClientError } from '../src/api/client';
import { useShoppingSession } from '../src/auth/SessionContext';
import { brandLogo, colors, fonts, spacing } from '../src/theme';

type Step = 'phone' | 'otp' | 'testCode';

export default function LoginScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { completeSignIn, signInWithTestCode } = useShoppingSession();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [testCode, setTestCode] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const digits = phone.replace(/\D/g, '');

  function finishLogin() {
    if (returnTo && typeof returnTo === 'string' && returnTo.startsWith('/')) {
      // Prefer object navigation so query params (e.g. shopTab=orders) apply reliably.
      if (returnTo.includes('shop') && returnTo.includes('shopTab=orders')) {
        router.replace({ pathname: '/(tabs)/shop', params: { shopTab: 'orders' } });
        return;
      }
      router.replace(returnTo);
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/profile');
    }
  }

  async function handleSendOtp() {
    if (digits.length !== 10) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const response = await requestMobileOtp(digits);
      setChallengeId(response.challengeId);
      setOtp('');
      setStep('otp');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not send OTP.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    const code = otp.replace(/\D/g, '');
    if (!challengeId) {
      setError('Request a new OTP and try again.');
      return;
    }
    if (code.length < 4) {
      setError('Enter the OTP sent to your phone.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const response = await verifyMobileOtp(challengeId, code);
      await completeSignIn(response);
      finishLogin();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'OTP verification failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleTestSignIn() {
    const code = testCode.trim();
    if (!code) {
      setError('Enter your test access code.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await signInWithTestCode(code);
      finishLogin();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(
          err.status === 404
            ? 'Test access is not enabled on this server.'
            : err.message,
        );
      } else {
        setError('Test sign-in failed.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
      <View style={styles.brandBlock}>
        <Image source={brandLogo} style={styles.logo} resizeMode="contain" accessibilityLabel="Vivi Crochet" />
        <Text style={styles.title}>Sign in</Text>
        <Text style={styles.sub}>
          {step === 'phone'
            ? 'We will send a one-time code to verify your mobile number.'
            : step === 'testCode'
              ? 'Sign in to the shared test account with its access code.'
              : `Enter the OTP sent to +91 ${digits}.`}
        </Text>
      </View>

      <View style={styles.form}>
        {error && <Text style={styles.error}>{error}</Text>}

        {step === 'phone' ? (
          <>
            <Text style={styles.label}>Mobile number</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              maxLength={10}
              placeholder="9876543210"
              placeholderTextColor={colors.muted}
              autoFocus
            />

            <Pressable
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSendOtp}
              disabled={loading}
            >
              <Text style={styles.buttonText}>{loading ? 'Sending OTP…' : 'Send OTP'}</Text>
            </Pressable>

            <Pressable
              style={styles.secondaryBtn}
              onPress={() => {
                setStep('testCode');
                setError(null);
              }}
              disabled={loading}
            >
              <Text style={styles.secondaryText}>Have a test access code?</Text>
            </Pressable>
          </>
        ) : step === 'testCode' ? (
          <>
            <Text style={styles.label}>Test access code</Text>
            <TextInput
              style={styles.input}
              value={testCode}
              onChangeText={setTestCode}
              placeholder="Paste your code"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              autoFocus
            />

            <Pressable
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleTestSignIn}
              disabled={loading}
            >
              <Text style={styles.buttonText}>{loading ? 'Signing in…' : 'Sign in with code'}</Text>
            </Pressable>

            <Pressable
              style={styles.secondaryBtn}
              onPress={() => {
                setStep('phone');
                setTestCode('');
                setError(null);
              }}
              disabled={loading}
            >
              <Text style={styles.secondaryText}>Use my mobile number instead</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.label}>OTP code</Text>
            <TextInput
              style={styles.input}
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="6-digit code"
              placeholderTextColor={colors.muted}
              autoFocus
            />

            <Pressable
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleVerifyOtp}
              disabled={loading}
            >
              <Text style={styles.buttonText}>{loading ? 'Verifying…' : 'Verify & sign in'}</Text>
            </Pressable>

            <Pressable
              style={styles.secondaryBtn}
              onPress={handleSendOtp}
              disabled={loading}
            >
              <Text style={styles.secondaryText}>Resend OTP</Text>
            </Pressable>

            <Pressable
              style={styles.secondaryBtn}
              onPress={() => {
                setStep('phone');
                setOtp('');
                setChallengeId(null);
                setError(null);
              }}
              disabled={loading}
            >
              <Text style={styles.secondaryText}>Change number</Text>
            </Pressable>
          </>
        )}

        <Pressable style={styles.skipBtn} onPress={() => router.back()}>
          <Text style={styles.skipText}>Continue without signing in</Text>
        </Pressable>
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.pinkSoft,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  brandBlock: {
    marginBottom: spacing.xl,
    alignItems: 'center',
  },
  logo: {
    width: 140,
    height: 140,
    marginBottom: 8,
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 34,
    color: colors.ink,
    marginTop: 8,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  sub: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.muted,
    marginTop: 10,
    lineHeight: 21,
    textAlign: 'center',
  },
  form: {
    backgroundColor: colors.white,
    borderRadius: 22,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.softBorder,
  },
  label: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.muted,
    marginBottom: 6,
    marginTop: 12,
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
  button: {
    marginTop: spacing.lg,
    backgroundColor: colors.pink,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontFamily: fonts.extraBold,
    color: colors.white,
    fontSize: 15,
  },
  secondaryBtn: {
    marginTop: spacing.sm,
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.pink,
  },
  skipBtn: {
    marginTop: spacing.md,
    paddingVertical: 10,
    alignItems: 'center',
  },
  skipText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.muted,
  },
  error: {
    fontFamily: fonts.semiBold,
    color: colors.danger,
    fontSize: 13,
    marginBottom: 8,
  },
});
