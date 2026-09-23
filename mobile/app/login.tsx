import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
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
import { requestMobileOtp, verifyMobileOtp, registerCustomerEmail, loginCustomerEmail, requestCustomerPasswordReset, confirmCustomerPasswordReset } from '../src/api/auth';
import { ApiClientError } from '../src/api/client';
import { updateMyProfile } from '../src/api/me';
import {
  loadRegistrationDraft,
  saveRegistrationDraft,
  type AuthRegion,
} from '../src/auth/registrationDraft';
import { useShoppingSession, useLearningCustomer } from '../src/auth/SessionContext';
import { BackButton } from '../src/components/BackButton';
import { SearchableSelect } from '../src/components/SearchableSelect';
import { COUNTRIES } from '../src/data/countries';
import { citiesForState, INDIA_STATES } from '../src/data/indiaLocations';
import { useI18n } from '../src/i18n';
import { uiFonts, type UiFonts } from '../src/i18n/uiFonts';
import { colors, radii, spacing } from '../src/theme';
import { isValidEmail, isValidPhone, isValidName, normalizePhone, realCustomerName } from '../src/utils/validation';

type Intent = 'register' | 'login';
type Step =
  | 'entry'
  | 'region'
  | 'india_register'
  | 'india_login'
  | 'india_otp'
  | 'india_complete_profile'
  | 'intl_register'
  | 'intl_login'
  | 'intl_forgot'
  | 'intl_reset'
  | 'testCode';

const AGE_OPTIONS = Array.from({ length: 71 }, (_, i) => String(i + 10));

/** Password rules match backend LoginRequestValidator (min 8). */
const MIN_PASSWORD_LENGTH = 8;

export default function LoginScreen() {
  const { t, language } = useI18n();
  const fonts = uiFonts(language);
  const styles = useMemo(() => createStyles(fonts), [language]);
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { completeSignIn, signInWithTestCode } = useShoppingSession();
  const { saveProfile: saveLearningProfile } = useLearningCustomer();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>('entry');
  const [intent, setIntent] = useState<Intent>('register');
  const [region, setRegion] = useState<AuthRegion | null>(null);

  const [age, setAge] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [state, setState] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [testCode, setTestCode] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const digits = normalizePhone(phone);
  const cityOptions = useMemo(() => (state ? citiesForState(state) : []), [state]);
  const isCreateAccount =
    step === 'india_register' || step === 'intl_register' || step === 'india_complete_profile';
  const hideGuestLink = isCreateAccount || (intent === 'register' && step !== 'entry');

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e: KeyboardEvent) => {
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  /** Keep the focused field visible — do not always jump to the end (that hides Name). */
  function scrollFieldIntoView(edge: 'start' | 'end' = 'end') {
    requestAnimationFrame(() => {
      if (edge === 'start') {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
        return;
      }
      scrollRef.current?.scrollToEnd({ animated: true });
    });
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

  function goBack() {
    setError(null);
    setInfo(null);
    switch (step) {
      case 'region':
        setStep('entry');
        break;
      case 'india_register':
      case 'india_login':
      case 'intl_register':
      case 'intl_login':
        setStep('region');
        break;
      case 'intl_forgot':
        setResetCode('');
        setNewPassword('');
        setStep('intl_login');
        break;
      case 'intl_reset':
        setResetCode('');
        setNewPassword('');
        setStep('intl_forgot');
        break;
      case 'india_otp':
        setOtp('');
        setChallengeId(null);
        setStep(intent === 'login' ? 'india_login' : 'india_register');
        break;
      case 'india_complete_profile':
        // Profile is required after OTP for new/incomplete accounts — stay here.
        break;
      case 'testCode':
        setStep('entry');
        setTestCode('');
        break;
      default:
        if (router.canGoBack()) router.back();
        break;
    }
  }

  function startIntent(next: Intent) {
    setIntent(next);
    setRegion(null);
    setError(null);
    setStep('region');
  }

  function selectRegion(next: AuthRegion) {
    setRegion(next);
    setError(null);
    if (next === 'india') {
      setStep(intent === 'login' ? 'india_login' : 'india_register');
      return;
    }
    setCountry((current) => current?.trim() || null);
    setStep(intent === 'login' ? 'intl_login' : 'intl_register');
  }

  async function handleSendOtp() {
    if (intent === 'register') {
      if (!isValidName(fullName)) {
        setError(t('validation.fullName'));
        return;
      }
      if (!age) {
        setError(t('validation.age'));
        return;
      }
      if (!state) {
        setError(t('validation.state'));
        return;
      }
      if (!city) {
        setError(t('validation.city'));
        return;
      }
    }
    if (!isValidPhone(digits)) {
      setError(t('validation.phone'));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const response = await requestMobileOtp(digits);
      setChallengeId(response.challengeId);
      setOtp('');
      setStep('india_otp');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('auth.otpSendFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    const code = otp.replace(/\D/g, '');
    if (!challengeId) {
      setError(t('auth.requestOtpAgain'));
      return;
    }
    if (code.length < 4) {
      setError(t('auth.enterPhoneOtp'));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const previous = await loadRegistrationDraft();
      const ageNumber = age ? Number(age) : previous?.age;
      const response = await verifyMobileOtp(challengeId, code, {
        name: fullName.trim() || undefined,
        age: ageNumber && ageNumber > 0 ? ageNumber : undefined,
        state: state ?? previous?.state,
        city: city ?? previous?.city,
      });
      const resolvedName = realCustomerName(fullName, response.user.name);
      await saveRegistrationDraft({
        region: 'india',
        age: ageNumber && Number.isFinite(ageNumber) ? ageNumber : previous?.age ?? 0,
        country: 'India',
        state: state ?? previous?.state,
        city: city ?? previous?.city,
        authMethod: 'phone_otp',
        phone: digits,
        updatedAt: new Date().toISOString(),
      });
      await saveLearningProfile({
        fullName: resolvedName,
        phone: digits,
        // Never store the synthetic login email (customer.{phone}@vivicrochet.dev).
        email: '',
      });
      await completeSignIn(response);
      if (response.requiresProfileSetup) {
        setStep('india_complete_profile');
        return;
      }
      finishLogin();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('auth.otpVerifyFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function handleCompleteIndiaProfile() {
    if (!isValidName(fullName)) {
      setError(t('validation.fullName'));
      return;
    }
    if (!age) {
      setError(t('validation.age'));
      return;
    }
    if (!state) {
      setError(t('validation.state'));
      return;
    }
    if (!city) {
      setError(t('validation.city'));
      return;
    }
    const ageNumber = Number(age);
    setError(null);
    setLoading(true);
    try {
      await updateMyProfile({
        fullName: fullName.trim(),
        age: ageNumber,
        state,
        city,
      });
      await saveRegistrationDraft({
        region: 'india',
        age: ageNumber,
        country: 'India',
        state,
        city,
        authMethod: 'phone_otp',
        phone: digits,
        updatedAt: new Date().toISOString(),
      });
      await saveLearningProfile({
        fullName: fullName.trim(),
        phone: digits,
        email: '',
      });
      finishLogin();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('auth.saveDetailsFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function handleTestSignIn() {
    const code = testCode.trim();
    if (!code) {
      setError(t('auth.enterTestCode'));
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
            ? t('auth.testAccessDisabled')
            : err.message,
        );
      } else {
        setError(t('auth.testSignInFailed'));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleIntlRegister() {
    if (!isValidName(fullName)) {
      setError(t('validation.fullName'));
      return;
    }
    if (!age) {
      setError(t('validation.age'));
      return;
    }
    if (!country) {
      setError(t('validation.country'));
      return;
    }
    if (!isValidEmail(email)) {
      setError(t('validation.email'));
      return;
    }
    if (password.trim().length < MIN_PASSWORD_LENGTH) {
      setError(t('validation.password'));
      return;
    }
    const submittedPassword = password;
    setError(null);
    setLoading(true);
    try {
      const ageNumber = Number(age);
      const response = await registerCustomerEmail({
        email,
        password: submittedPassword,
        age: ageNumber,
        country,
        name: fullName.trim() || undefined,
      });
      setPassword('');
      await saveRegistrationDraft({
        region: 'international',
        age: ageNumber,
        country,
        authMethod: 'email_password',
        email: email.trim().toLowerCase(),
        updatedAt: new Date().toISOString(),
      });
      await saveLearningProfile({
        fullName: realCustomerName(fullName, response.user.name),
        phone: '',
        email: email.trim().toLowerCase(),
      });
      await completeSignIn(response);
      finishLogin();
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 429) {
        setError(t('auth.tooManyAttempts'));
      } else {
        setError(err instanceof ApiClientError ? err.message : t('auth.createAccountFailed'));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleIntlLogin() {
    if (!isValidEmail(email)) {
      setError(t('validation.email'));
      return;
    }
    if (!password.trim()) {
      setError(t('auth.enterPassword'));
      return;
    }
    const submittedPassword = password;
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const response = await loginCustomerEmail(email, submittedPassword);
      setPassword('');
      await saveRegistrationDraft({
        region: 'international',
        age: 0,
        country: '',
        authMethod: 'email_password',
        email: email.trim().toLowerCase(),
        updatedAt: new Date().toISOString(),
      });
      await saveLearningProfile({
        fullName: response.user.name?.trim() || '',
        phone: '',
        email: email.trim().toLowerCase(),
      });
      await completeSignIn(response);
      finishLogin();
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 429) {
        setError(t('auth.tooManyAttempts'));
      } else if (err instanceof ApiClientError && err.code === 'ACCOUNT_NOT_FOUND') {
        setError(err.message);
      } else {
        setError(err instanceof ApiClientError ? err.message : t('auth.signInFailed'));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotRequest() {
    if (!isValidEmail(email)) {
      setError(t('validation.email'));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await requestCustomerPasswordReset(email);
      setResetCode('');
      setNewPassword('');
      setStep('intl_reset');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('auth.resetSendFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotConfirm() {
    if (!isValidEmail(email)) {
      setError(t('validation.email'));
      return;
    }
    const code = resetCode.replace(/\D/g, '');
    if (code.length < 4) {
      setError(t('auth.enterEmailCode'));
      return;
    }
    if (newPassword.trim().length < MIN_PASSWORD_LENGTH) {
      setError(t('validation.password'));
      return;
    }
    const submittedPassword = newPassword;
    setNewPassword('');
    setError(null);
    setLoading(true);
    try {
      await confirmCustomerPasswordReset({
        email,
        code,
        newPassword: submittedPassword,
      });
      setPassword('');
      setResetCode('');
      setInfo(t('auth.passwordUpdated'));
      setError(null);
      setStep('intl_login');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('auth.resetFailed'));
    } finally {
      setLoading(false);
    }
  }

  const title = (() => {
    switch (step) {
      case 'entry':
        return t('auth.welcome');
      case 'region':
        return t('auth.whereBased');
      case 'india_register':
      case 'intl_register':
        return t('auth.createAccount');
      case 'india_complete_profile':
        return t('auth.completeProfile');
      case 'india_login':
      case 'intl_login':
        return t('auth.welcomeBack');
      case 'india_otp':
        return t('auth.verifyOtp');
      case 'intl_forgot':
        return t('auth.resetPassword');
      case 'intl_reset':
        return t('auth.chooseNewPassword');
      case 'testCode':
        return t('auth.testAccess');
      default:
        return t('auth.signIn');
    }
  })();

  const subtitle = (() => {
    switch (step) {
      case 'entry':
        return t('auth.welcomeSub');
      case 'region':
        return '';
      case 'india_register':
        return t('auth.indiaRegisterSub');
      case 'india_complete_profile':
        return t('auth.completeProfileSub');
      case 'india_login':
        return t('auth.indiaLoginSub');
      case 'india_otp':
        return t('auth.otpSentTo', { phone: digits });
      case 'intl_register':
        return t('auth.intlRegisterSub');
      case 'intl_login':
        return t('auth.intlLoginSub');
      case 'intl_forgot':
        return t('auth.forgotSub');
      case 'intl_reset':
        return t('auth.resetSub', { email: email.trim().toLowerCase() });
      case 'testCode':
        return t('auth.testAccessSub');
      default:
        return '';
    }
  })();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        {step !== 'entry' ? <BackButton onPress={goBack} /> : <View style={styles.topSpacer} />}
        {!hideGuestLink ? (
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Text style={styles.guestLink}>{t('auth.continueGuest')}</Text>
          </Pressable>
        ) : (
          <View style={styles.topSpacer} />
        )}
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 8 : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={[
            styles.scrollContent,
            isCreateAccount && styles.scrollContentCompact,
            {
              // Extra space so the last fields / CTA stay above the keyboard.
              paddingBottom: Math.max(insets.bottom, 12) + 56 + keyboardHeight,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator
          automaticallyAdjustKeyboardInsets
          bounces
          nestedScrollEnabled
        >
          <View style={[styles.brandBlock, isCreateAccount && styles.brandBlockCompact]}>
            <Text style={[styles.brandName, isCreateAccount && styles.brandNameCompact]}>
              VIVI
            </Text>
            <Text style={[styles.title, isCreateAccount && styles.titleCompact]}>{title}</Text>
            {subtitle ? (
              <Text style={[styles.sub, isCreateAccount && styles.subCompact]}>{subtitle}</Text>
            ) : null}
          </View>

          <View style={[styles.form, isCreateAccount && styles.formCompact]}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {info ? <Text style={styles.info}>{info}</Text> : null}

            {step === 'entry' ? (
              <>
                <Pressable style={styles.button} onPress={() => startIntent('register')}>
                  <Text style={styles.buttonText}>{t('auth.createAccountCta')}</Text>
                </Pressable>
                <Pressable style={styles.secondaryOutline} onPress={() => startIntent('login')}>
                  <Text style={styles.secondaryOutlineText}>{t('auth.signIn')}</Text>
                </Pressable>
                <Pressable
                  style={styles.secondaryBtn}
                  onPress={() => {
                    setStep('testCode');
                    setError(null);
                  }}
                >
                  <Text style={styles.secondaryText}>{t('auth.haveTestAccessCode')}</Text>
                </Pressable>
              </>
            ) : null}

            {step === 'region' ? (
              <>
                <Pressable
                  style={[styles.choice, region === 'india' && styles.choiceActive]}
                  onPress={() => selectRegion('india')}
                >
                  <Text style={styles.choiceEmoji}>🇮🇳</Text>
                  <View style={styles.choiceCopy}>
                    <Text style={styles.choiceTitle}>{t('auth.india')}</Text>
                    <Text style={styles.choiceSub}>{t('auth.phoneOtp')}</Text>
                  </View>
                </Pressable>
                <Pressable
                  style={[styles.choice, region === 'international' && styles.choiceActive]}
                  onPress={() => selectRegion('international')}
                >
                  <Text style={styles.choiceEmoji}>🌍</Text>
                  <View style={styles.choiceCopy}>
                    <Text style={styles.choiceTitle}>{t('auth.outsideIndia')}</Text>
                    <Text style={styles.choiceSub}>{t('auth.emailPassword')}</Text>
                  </View>
                </Pressable>
              </>
            ) : null}

            {step === 'india_register' ? (
              <>
                <Text style={[styles.label, styles.labelCompact, styles.labelFirst]}>
                  {t('auth.fullName')}
                </Text>
                <TextInput
                  style={[styles.input, styles.inputCompact]}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder={t('auth.yourName')}
                  placeholderTextColor={colors.muted}
                  autoCapitalize="words"
                  onFocus={() => scrollFieldIntoView('start')}
                />
                <SearchableSelect
                  label={t('auth.age')}
                  value={age}
                  placeholder={t('auth.selectAge')}
                  options={AGE_OPTIONS}
                  compact
                  onSelect={setAge}
                />
                <SearchableSelect
                  label={t('auth.state')}
                  value={state}
                  placeholder={t('auth.selectState')}
                  options={INDIA_STATES}
                  compact
                  onSelect={(next) => {
                    setState(next);
                    setCity(null);
                  }}
                />
                <SearchableSelect
                  label={t('auth.city')}
                  value={city}
                  placeholder={state ? t('auth.selectCity') : t('auth.selectStateFirst')}
                  options={cityOptions}
                  disabled={!state}
                  compact
                  allowCustom
                  onSelect={setCity}
                />
                <Text style={[styles.label, styles.labelCompact]}>{t('auth.mobileNumber')}</Text>
                <View style={styles.phoneRow}>
                  <View style={[styles.prefix, styles.prefixCompact]}>
                    <Text style={styles.prefixText}>+91</Text>
                  </View>
                  <TextInput
                    style={[styles.input, styles.inputCompact, styles.phoneInput]}
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    maxLength={10}
                    placeholder="9876543210"
                    placeholderTextColor={colors.muted}
                    onFocus={() => scrollFieldIntoView('end')}
                  />
                </View>
                <Pressable
                  style={[styles.button, styles.buttonCompact, loading && styles.buttonDisabled]}
                  onPress={handleSendOtp}
                  disabled={loading}
                >
                  <Text style={styles.buttonText}>
                    {loading ? t('auth.sendingOtp') : t('auth.continueWithOtp')}
                  </Text>
                </Pressable>
              </>
            ) : null}

            {step === 'india_login' ? (
              <>
                <Text style={styles.label}>{t('auth.mobileNumber')}</Text>
                <View style={styles.phoneRow}>
                  <View style={styles.prefix}>
                    <Text style={styles.prefixText}>+91</Text>
                  </View>
                  <TextInput
                    style={[styles.input, styles.phoneInput]}
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    maxLength={10}
                    placeholder="9876543210"
                    placeholderTextColor={colors.muted}
                  />
                </View>
                <Pressable
                  style={[styles.button, loading && styles.buttonDisabled]}
                  onPress={handleSendOtp}
                  disabled={loading}
                >
                  <Text style={styles.buttonText}>
                    {loading ? t('auth.sendingOtp') : t('auth.sendOtp')}
                  </Text>
                </Pressable>
              </>
            ) : null}

            {step === 'india_otp' ? (
              <>
                <Text style={styles.label}>{t('auth.otpCode')}</Text>
                <TextInput
                  style={styles.input}
                  value={otp}
                  onChangeText={setOtp}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder={t('auth.sixDigit')}
                  placeholderTextColor={colors.muted}
                />
                <Pressable
                  style={[styles.button, loading && styles.buttonDisabled]}
                  onPress={handleVerifyOtp}
                  disabled={loading}
                >
                  <Text style={styles.buttonText}>
                    {loading ? t('auth.verifying') : t('auth.verifyContinue')}
                  </Text>
                </Pressable>
                <Pressable style={styles.secondaryBtn} onPress={handleSendOtp} disabled={loading}>
                  <Text style={styles.secondaryText}>{t('auth.resendOtp')}</Text>
                </Pressable>
              </>
            ) : null}

            {step === 'india_complete_profile' ? (
              <>
                <Text style={[styles.label, styles.labelCompact, styles.labelFirst]}>
                  {t('auth.fullName')}
                </Text>
                <TextInput
                  style={[styles.input, styles.inputCompact]}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder={t('auth.yourName')}
                  placeholderTextColor={colors.muted}
                  autoCapitalize="words"
                  onFocus={() => scrollFieldIntoView('start')}
                />
                <SearchableSelect
                  label={t('auth.age')}
                  value={age}
                  placeholder={t('auth.selectAge')}
                  options={AGE_OPTIONS}
                  compact
                  onSelect={setAge}
                />
                <SearchableSelect
                  label={t('auth.state')}
                  value={state}
                  placeholder={t('auth.selectState')}
                  options={INDIA_STATES}
                  compact
                  onSelect={(next) => {
                    setState(next);
                    setCity(null);
                  }}
                />
                <SearchableSelect
                  label={t('auth.city')}
                  value={city}
                  placeholder={state ? t('auth.selectCity') : t('auth.selectStateFirst')}
                  options={cityOptions}
                  disabled={!state}
                  compact
                  allowCustom
                  onSelect={setCity}
                />
                <Pressable
                  style={[styles.button, styles.buttonCompact, loading && styles.buttonDisabled]}
                  onPress={handleCompleteIndiaProfile}
                  disabled={loading}
                >
                  <Text style={styles.buttonText}>
                    {loading ? t('common.saving') : t('auth.saveContinue')}
                  </Text>
                </Pressable>
              </>
            ) : null}

            {step === 'intl_register' ? (
              <>
                <Text style={[styles.label, styles.labelCompact, styles.labelFirst]}>
                  {t('auth.fullName')}
                </Text>
                <TextInput
                  style={[styles.input, styles.inputCompact]}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder={t('auth.yourName')}
                  placeholderTextColor={colors.muted}
                  autoCapitalize="words"
                  onFocus={() => scrollFieldIntoView('start')}
                />
                <SearchableSelect
                  label={t('auth.age')}
                  value={age}
                  placeholder={t('auth.selectAge')}
                  options={AGE_OPTIONS}
                  compact
                  onSelect={setAge}
                />
                <SearchableSelect
                  label={t('auth.country')}
                  value={country}
                  placeholder={t('auth.searchCountry')}
                  options={COUNTRIES}
                  compact
                  onSelect={setCountry}
                />
                <Text style={[styles.label, styles.labelCompact]}>{t('auth.email')}</Text>
                <TextInput
                  style={[styles.input, styles.inputCompact]}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder={t('auth.emailPlaceholder')}
                  placeholderTextColor={colors.muted}
                  onFocus={() => scrollFieldIntoView('end')}
                />
                <Text style={[styles.label, styles.labelCompact]}>{t('auth.password')}</Text>
                <TextInput
                  style={[styles.input, styles.inputCompact]}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder={t('auth.passwordHint')}
                  placeholderTextColor={colors.muted}
                  textContentType="newPassword"
                  autoComplete="new-password"
                  passwordRules="minlength: 8;"
                  onFocus={() => scrollFieldIntoView('end')}
                />
                <Pressable
                  style={[styles.button, styles.buttonCompact, loading && styles.buttonDisabled]}
                  onPress={handleIntlRegister}
                  disabled={loading}
                >
                  <Text style={styles.buttonText}>
                    {loading ? t('auth.creatingAccount') : t('auth.createAccountArrow')}
                  </Text>
                </Pressable>
              </>
            ) : null}

            {step === 'intl_login' ? (
              <>
                <Text style={styles.label}>{t('auth.email')}</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder={t('auth.emailPlaceholder')}
                  placeholderTextColor={colors.muted}
                />
                <Text style={styles.label}>{t('auth.password')}</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder={t('auth.password')}
                  placeholderTextColor={colors.muted}
                  textContentType="password"
                />
                <Pressable
                  style={[styles.button, loading && styles.buttonDisabled]}
                  onPress={handleIntlLogin}
                  disabled={loading}
                >
                  <Text style={styles.buttonText}>
                    {loading ? t('auth.signingIn') : t('auth.signIn')}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.secondaryBtn}
                  onPress={() => {
                    setError(null);
                    setInfo(null);
                    setStep('intl_forgot');
                  }}
                >
                  <Text style={styles.secondaryText}>{t('auth.forgotPassword')}</Text>
                </Pressable>
                <Pressable
                  style={styles.secondaryBtn}
                  onPress={() => {
                    setError(null);
                    setInfo(null);
                    setIntent('register');
                    setStep('intl_register');
                  }}
                >
                  <Text style={styles.secondaryText}>{t('auth.newHereCreate')}</Text>
                </Pressable>
              </>
            ) : null}

            {step === 'intl_forgot' ? (
              <>
                <Text style={styles.label}>{t('auth.email')}</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder={t('auth.emailPlaceholder')}
                  placeholderTextColor={colors.muted}
                  onFocus={scrollFieldIntoView}
                />
                <Pressable
                  style={[styles.button, loading && styles.buttonDisabled]}
                  onPress={handleForgotRequest}
                  disabled={loading}
                >
                  <Text style={styles.buttonText}>
                    {loading ? t('auth.sendingCode') : t('auth.emailResetCode')}
                  </Text>
                </Pressable>
              </>
            ) : null}

            {step === 'intl_reset' ? (
              <>
                <Text style={styles.label}>{t('auth.resetCode')}</Text>
                <TextInput
                  style={styles.input}
                  value={resetCode}
                  onChangeText={setResetCode}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder={t('auth.sixDigit')}
                  placeholderTextColor={colors.muted}
                  onFocus={scrollFieldIntoView}
                />
                <Text style={styles.label}>{t('auth.newPassword')}</Text>
                <TextInput
                  style={styles.input}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder={t('auth.passwordHint')}
                  placeholderTextColor={colors.muted}
                  textContentType="newPassword"
                  onFocus={scrollFieldIntoView}
                />
                <Pressable
                  style={[styles.button, loading && styles.buttonDisabled]}
                  onPress={handleForgotConfirm}
                  disabled={loading}
                >
                  <Text style={styles.buttonText}>
                    {loading ? t('auth.updating') : t('auth.updatePassword')}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.secondaryBtn}
                  onPress={() => void handleForgotRequest()}
                  disabled={loading}
                >
                  <Text style={styles.secondaryText}>{t('auth.resendCode')}</Text>
                </Pressable>
              </>
            ) : null}

            {step === 'testCode' ? (
              <>
                <Text style={styles.label}>{t('auth.testAccessCode')}</Text>
                <TextInput
                  style={styles.input}
                  value={testCode}
                  onChangeText={setTestCode}
                  placeholder={t('auth.pasteCode')}
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                />
                <Pressable
                  style={[styles.button, loading && styles.buttonDisabled]}
                  onPress={handleTestSignIn}
                  disabled={loading}
                >
                  <Text style={styles.buttonText}>
                    {loading ? t('auth.signingIn') : t('auth.signInWithCode')}
                  </Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function createStyles(fonts: UiFonts) {
  return StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.white,
  },
  flex: {
    flex: 1,
  },
  topBar: {
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  topSpacer: {
    width: 36,
    height: 36,
  },
  guestLink: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.muted,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
  },
  scrollContentCompact: {
    paddingBottom: 8,
  },
  brandBlock: {
    marginBottom: spacing.md,
  },
  brandBlockCompact: {
    marginBottom: 4,
  },
  brandName: {
    fontFamily: fonts.display,
    fontSize: 34,
    color: colors.ink,
    letterSpacing: 1,
  },
  brandNameCompact: {
    fontSize: 22,
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 22,
    color: colors.ink,
    marginTop: 8,
    letterSpacing: -0.4,
  },
  titleCompact: {
    fontSize: 17,
    marginTop: 2,
  },
  sub: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.muted,
    marginTop: 6,
    lineHeight: 20,
  },
  subCompact: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
    marginBottom: 2,
  },
  form: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.softBorder,
  },
  formCompact: {
    padding: spacing.md,
    borderRadius: radii.lg,
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
  labelCompact: {
    marginTop: 8,
    marginBottom: 4,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  labelFirst: {
    marginTop: 0,
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
  inputCompact: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
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
  prefixCompact: {
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  prefixText: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: colors.ink,
  },
  phoneInput: {
    flex: 1,
  },
  button: {
    marginTop: spacing.lg,
    backgroundColor: colors.pink,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonCompact: {
    marginTop: spacing.md,
    borderRadius: 12,
    paddingVertical: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontFamily: fonts.extraBold,
    color: colors.white,
    fontSize: 14,
  },
  secondaryOutline: {
    marginTop: spacing.sm,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.pink,
  },
  secondaryOutlineText: {
    fontFamily: fonts.extraBold,
    color: colors.pink,
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
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1.5,
    borderColor: colors.softBorder,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 12,
    backgroundColor: colors.white,
  },
  choiceActive: {
    borderColor: colors.pink,
    backgroundColor: colors.pinkSoft,
  },
  choiceEmoji: {
    fontSize: 28,
  },
  choiceCopy: {
    flex: 1,
  },
  choiceTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 17,
    color: colors.ink,
  },
  choiceSub: {
    marginTop: 2,
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
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
  forgotHint: {
    marginTop: spacing.sm,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 17,
  },
  });
}
