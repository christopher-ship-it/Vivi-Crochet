import {
  NotoSansDevanagari_400Regular,
  NotoSansDevanagari_600SemiBold,
  NotoSansDevanagari_700Bold,
} from '@expo-google-fonts/noto-sans-devanagari';
import {
  NotoSansTamil_400Regular,
  NotoSansTamil_600SemiBold,
  NotoSansTamil_700Bold,
} from '@expo-google-fonts/noto-sans-tamil';
import { Niconne_400Regular } from '@expo-google-fonts/niconne';
import { Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold } from '@expo-google-fonts/nunito';
import { Tangerine_400Regular, Tangerine_700Bold } from '@expo-google-fonts/tangerine';
import { Stack, useRouter } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { ErrorBoundaryProps } from 'expo-router';
import { SessionProvider } from '../src/auth/SessionContext';
import { PreferenceSync } from '../src/preferences/PreferenceSync';
import { PreferencesProvider } from '../src/preferences/PreferencesContext';
import { CartProvider } from '../src/cart/CartContext';
import { WishlistProvider } from '../src/wishlist/WishlistContext';
import { AppUpdateCard } from '../src/components/AppUpdateCard';
import { BackButton } from '../src/components/BackButton';
import { GradientBackground } from '../src/components/GradientBackground';
import { HeaderBackground } from '../src/components/HeaderBackground';
import { I18nProvider, useI18n } from '../src/i18n';
import { uiFonts } from '../src/i18n/uiFonts';
import { addNotificationResponseListener } from '../src/notifications/push';
import { TapCapture } from '../src/telemetry/TapCapture';
import { TelemetryHost } from '../src/telemetry/TelemetryHost';
import { errorToPayload, reportIssue } from '../src/telemetry/telemetry';
import { colors } from '../src/theme';
import { applyStatusBar } from '../src/utils/statusBar';

// Keep native splash briefly, but NEVER forever — module-level escape if React never mounts.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);
setTimeout(() => {
  void SplashScreen.hideAsync().catch(() => undefined);
}, 2500);

/**
 * Both `app/index.tsx` (animated splash) and `app/(tabs)/index.tsx` (Home) resolve to "/".
 * Pin the root stack to the splash route so a cold start always plays it before Home.
 */
export const unstable_settings = {
  initialRouteName: 'index',
};

/** Catches render errors in any screen: reports them to the admin App health page. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    void reportIssue(errorToPayload(error, false));
  }, [error]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.canvas }}>
      <Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink, marginBottom: 8 }}>
        Something went wrong
      </Text>
      <Text style={{ color: colors.ink, textAlign: 'center', marginBottom: 20 }}>
        We have been notified. Please try again.
      </Text>
      <Pressable
        onPress={retry}
        style={{ backgroundColor: colors.pink, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999 }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>Try again</Text>
      </Pressable>
    </View>
  );
}

function PushNotificationNavigator() {
  const router = useRouter();

  useEffect(() => {
    const sub = addNotificationResponseListener((screen) => {
      try {
        const target =
          screen === '/(tabs)/index' || screen === '/(tabs)/' ? '/(tabs)' : screen;
        router.push(target as never);
      } catch {
        // Ignore invalid deep links from push payload.
      }
    });
    return () => sub.remove();
  }, [router]);

  return null;
}

function AppStack() {
  const { t, language } = useI18n();
  const fonts = uiFonts(language);

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: 'transparent',
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: 0,
        },
        headerBackground: () => <HeaderBackground />,
        headerTintColor: colors.pink,
        headerTitleAlign: 'center',
        headerTitleStyle: {
          fontFamily: fonts.extraBold,
          color: colors.ink,
        },
        // Opaque card fill prevents previous-screen text showing through during push/pop.
        contentStyle: { backgroundColor: colors.canvas },
        animation: 'fade',
        headerShadowVisible: false,
        headerBackVisible: false,
        // Always offer a back control — when history is empty (e.g. restored deep screen),
        // BackButton falls back to Home instead of exiting the app.
        headerLeft: () => (
          <View style={{ marginLeft: 4 }}>
            <BackButton fallbackHref="/(tabs)" />
          </View>
        ),
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false, animation: 'none' }} />
      <Stack.Screen name="+not-found" options={{ headerShown: false }} />
      <Stack.Screen name="language-onboarding" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="country-onboarding" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="edit-address" options={{ title: t('headers.address') }} />
      <Stack.Screen name="help-center" options={{ headerShown: false }} />
      <Stack.Screen name="support-chat" options={{ headerShown: false }} />
      <Stack.Screen name="privacy-policy" options={{ title: t('headers.privacyPolicy') }} />
      <Stack.Screen name="terms" options={{ title: t('headers.terms') }} />
      <Stack.Screen
        name="cart"
        options={{
          title: t('headers.yourCart'),
          headerLeft: () => (
            <View style={{ marginLeft: 4 }}>
              <BackButton fallbackHref="/(tabs)/shop" />
            </View>
          ),
        }}
      />
      <Stack.Screen
        name="checkout"
        options={{
          title: t('headers.checkout'),
          headerLeft: () => (
            <View style={{ marginLeft: 4 }}>
              <BackButton fallbackHref="/cart" />
            </View>
          ),
        }}
      />
      <Stack.Screen name="add-delivery-address" options={{ title: t('headers.addAddress') }} />
      <Stack.Screen name="product/[id]" options={{ title: t('headers.product') }} />
      <Stack.Screen name="order-confirmation" options={{ title: '', headerBackVisible: false }} />
      <Stack.Screen name="live-booking-confirmation" options={{ title: '', headerBackVisible: false }} />
      <Stack.Screen name="order/[id]" options={{ title: t('headers.orderTracking') }} />
      <Stack.Screen name="course/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="lesson/[id]" options={{ title: t('headers.lesson') }} />
      <Stack.Screen name="profile-settings" options={{ title: t('headers.profileSettings') }} />
    </Stack>
  );
}

export default function RootLayout() {
  // Load fonts in the background — never block first paint / splash handoff.
  useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Niconne_400Regular,
    Tangerine_400Regular,
    Tangerine_700Bold,
    NotoSansTamil_400Regular,
    NotoSansTamil_600SemiBold,
    NotoSansTamil_700Bold,
    NotoSansDevanagari_400Regular,
    NotoSansDevanagari_600SemiBold,
    NotoSansDevanagari_700Bold,
  });

  useEffect(() => {
    applyStatusBar('dark');
  }, []);

  return (
    <I18nProvider>
      <PreferencesProvider>
      <SessionProvider>
        <CartProvider>
          <WishlistProvider>
            <GradientBackground>
              <TapCapture>
                <StatusBar style="dark" translucent backgroundColor="transparent" />
                <PushNotificationNavigator />
                <PreferenceSync />
                <TelemetryHost />
                <AppStack />
                <AppUpdateCard />
              </TapCapture>
            </GradientBackground>
          </WishlistProvider>
        </CartProvider>
      </SessionProvider>
      </PreferencesProvider>
    </I18nProvider>
  );
}
