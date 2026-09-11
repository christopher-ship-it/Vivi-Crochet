import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Keyboard,
  KeyboardAvoidingView,
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
import { requestMobileOtp, verifyMobileOtp } from '../src/api/auth';
import { ApiClientError } from '../src/api/client';
import { useShoppingSession } from '../src/auth/SessionContext';
import { HeroGradient } from '../src/components/HeroGradient';
import { colors, fonts, radii, spacing } from '../src/theme';
import { isValidName } from '../src/utils/validation';

type Step = 'phone' | 'otp' | 'testCode';

// Decorative only — placeholder crochet/yarn stock photos for the sign-in
// header grid (Unsplash), standing in until real product photography is
// wired in. Purely visual: no data fetching, no change to sign-in behavior.
const HERO_IMAGES = [
  'https://images.unsplash.com/photo-1668072587859-f0f30c8fa938?w=400&q=80&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1519412849983-957822373d02?w=400&q=80&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1632649027900-389e810204e6?w=400&q=80&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1620633437938-be73c35eb77e?w=400&q=80&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1648005539099-709d5be525fb?w=400&q=80&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1627667539472-75fbc7f4654d?w=400&q=80&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1595341595379-cf1cb694ea1f?w=400&q=80&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1584992236310-6edddc08acff?w=400&q=80&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1470049384172-927891aad5e9?w=400&q=80&auto=format&fit=crop',
];

const HERO_COLUMNS = [
  [HERO_IMAGES[0], HERO_IMAGES[1], HERO_IMAGES[2], HERO_IMAGES[3]],
  [HERO_IMAGES[4], HERO_IMAGES[5], HERO_IMAGES[6], HERO_IMAGES[7]],
  [HERO_IMAGES[8], HERO_IMAGES[0], HERO_IMAGES[1], HERO_IMAGES[2]],
];
const HERO_COLUMN_DURATIONS = [13000, 28000, 19000];
const HERO_TILE_SIZE = 80;
const HERO_TILE_GAP = 6;
const HERO_COLUMN_GAP = 10;
const HERO_WRAP_HEIGHT = 260;

function HeroMarqueeColumn({ images, duration }: { images: string[]; duration: number }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const distance = images.length * (HERO_TILE_SIZE + HERO_TILE_GAP);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(translateY, {
          toValue: -distance,
          duration,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [distance, duration, translateY]);

  const strip = [...images, ...images];

  return (
    <View style={styles.marqueeColumn}>
      <Animated.View style={[styles.marqueeTrack, { transform: [{ translateY }] }]}>
        {strip.map((uri, index) => (
          <Image key={`${uri}-${index}`} source={{ uri }} style={styles.heroTile} resizeMode="cover" />
        ))}
      </Animated.View>
    </View>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { completeSignIn, signInWithTestCode } = useShoppingSession();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('phone');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [testCode, setTestCode] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  // Hide hero as soon as the user focuses a field or starts typing.
  // Brand + form live in a separate fixed pane so they don't jump with the hero.
  const [editing, setEditing] = useState(false);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const digits = phone.replace(/\D/g, '');
  const showHero = !editing && keyboardHeight === 0;

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e: KeyboardEvent) => {
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
      setEditing(true);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    };
  }, []);

  function beginEditing() {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
    setEditing(true);
  }

  function endEditingSoon() {
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    // Debounce: moving between fields fires blur then focus; only restore
    // the hero if focus does not land on another input shortly after.
    blurTimeoutRef.current = setTimeout(() => {
      if (keyboardHeight === 0) setEditing(false);
      blurTimeoutRef.current = null;
    }, 180);
  }

  function finishLogin() {
    if (returnTo && typeof returnTo === 'string' && returnTo.startsWith('/')) {
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
    if (!isValidName(fullName)) {
      setError('Enter your full name (at least 2 characters).');
      return;
    }
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
    if (!isValidName(fullName)) {
      setError('Enter your full name, then request a new OTP.');
      setStep('phone');
      return;
    }
    if (code.length < 4) {
      setError('Enter the OTP sent to your phone.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const response = await verifyMobileOtp(challengeId, code, fullName.trim());
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
    <View style={styles.root}>
      {showHero ? (
        <HeroGradient style={[styles.heroWrap, { paddingTop: insets.top + 14 }]}>
          <View style={styles.heroColumns}>
            {HERO_COLUMNS.map((column, columnIndex) => (
              <HeroMarqueeColumn
                key={columnIndex}
                images={column}
                duration={HERO_COLUMN_DURATIONS[columnIndex]}
              />
            ))}
          </View>
        </HeroGradient>
      ) : null}

      {/* Fixed pane: brand + form stay put; only the hero above mounts/unmounts. */}
      <KeyboardAvoidingView
        style={styles.fixedPane}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: showHero ? spacing.lg : insets.top + spacing.lg,
              paddingBottom: insets.bottom + 24,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.brandBlock}>
            <Text style={styles.brandName}>Vivi Crochet</Text>
            <Text style={styles.title}>Sign in</Text>
            <Text style={styles.sub}>
              {step === 'phone'
                ? 'Tell us your name, then we will send a one-time code to verify your mobile number.'
                : step === 'testCode'
                  ? 'Sign in to the shared test account with its access code.'
                  : `Enter the OTP sent to +91 ${digits}.`}
            </Text>
          </View>

          <View style={styles.form}>
            {error && <Text style={styles.error}>{error}</Text>}

            {step === 'phone' ? (
              <>
                <Text style={styles.label}>Full name</Text>
                <TextInput
                  style={styles.input}
                  value={fullName}
                  onChangeText={(text) => {
                    beginEditing();
                    setFullName(text);
                  }}
                  autoCapitalize="words"
                  autoCorrect={false}
                  placeholder="Your name"
                  placeholderTextColor={colors.muted}
                  onFocus={beginEditing}
                  onBlur={endEditingSoon}
                  returnKeyType="next"
                />

                <Text style={styles.label}>Mobile number</Text>
                <TextInput
                  style={styles.input}
                  value={phone}
                  onChangeText={(text) => {
                    beginEditing();
                    setPhone(text);
                  }}
                  keyboardType="phone-pad"
                  maxLength={10}
                  placeholder="9876543210"
                  placeholderTextColor={colors.muted}
                  onFocus={beginEditing}
                  onBlur={endEditingSoon}
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
                  onChangeText={(text) => {
                    beginEditing();
                    setTestCode(text);
                  }}
                  placeholder="Paste your code"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                  onFocus={beginEditing}
                  onBlur={endEditingSoon}
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
                  onChangeText={(text) => {
                    beginEditing();
                    setOtp(text);
                  }}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="6-digit code"
                  placeholderTextColor={colors.muted}
                  onFocus={beginEditing}
                  onBlur={endEditingSoon}
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  heroWrap: {
    height: HERO_WRAP_HEIGHT,
    overflow: 'hidden',
    backgroundColor: 'transparent',
    paddingHorizontal: spacing.md,
  },
  heroColumns: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: HERO_COLUMN_GAP,
  },
  marqueeColumn: {
    width: HERO_TILE_SIZE,
    height: '100%',
    overflow: 'hidden',
  },
  marqueeTrack: {
    flexDirection: 'column',
  },
  heroTile: {
    width: HERO_TILE_SIZE,
    height: HERO_TILE_SIZE,
    borderRadius: radii.lg,
    backgroundColor: colors.softBorder,
    marginBottom: HERO_TILE_GAP,
  },
  fixedPane: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    paddingHorizontal: spacing.lg,
  },
  brandBlock: {
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  brandName: {
    fontFamily: fonts.extraBold,
    fontSize: 18,
    color: colors.pink,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 20,
    color: colors.ink,
    marginTop: 4,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  sub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    marginTop: 6,
    lineHeight: 18,
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
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontFamily: fonts.extraBold,
    color: colors.white,
    fontSize: 14,
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
