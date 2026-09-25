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
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SessionProvider } from '../src/auth/SessionContext';
import { CartProvider } from '../src/cart/CartContext';
import { WishlistProvider } from '../src/wishlist/WishlistContext';
import { AppUpdateCard } from '../src/components/AppUpdateCard';
import { BackButton } from '../src/components/BackButton';
import { GradientBackground } from '../src/components/GradientBackground';
import { HeaderBackground } from '../src/components/HeaderBackground';
import { I18nProvider, useI18n } from '../src/i18n';
import { uiFonts } from '../src/i18n/uiFonts';
import { RememberRoute } from '../src/navigation/RememberRoute';
import { addNotificationResponseListener } from '../src/notifications/push';
import { colors } from '../src/theme';
import { applyStatusBar } from '../src/utils/statusBar';

// Keep the native splash up through font load so cold start never flashes white.
void SplashScreen.preventAutoHideAsync();

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

/** If useFonts never settles (some OEM builds), still mount the app. */
const FONT_WAIT_MS = 4000;

export default function RootLayout() {
  const [loaded, fontError] = useFonts({
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
  const [fontTimedOut, setFontTimedOut] = useState(false);

  useEffect(() => {
    // Default: dark icons on light gradient screens
    applyStatusBar('dark');
  }, []);

  useEffect(() => {
    if (loaded || fontError) return;
    const id = setTimeout(() => setFontTimedOut(true), FONT_WAIT_MS);
    return () => clearTimeout(id);
  }, [loaded, fontError]);

  useEffect(() => {
    // Fonts failed — don't leave the native splash stuck forever.
    // On timeout we still mount the tree; AnimatedSplash owns the normal hide.
    if (fontError) {
      void SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [fontError]);

  if (!loaded && !fontError && !fontTimedOut) return null;

  return (
    <I18nProvider>
      <SessionProvider>
        <CartProvider>
          <WishlistProvider>
            <GradientBackground>
              <StatusBar style="dark" translucent backgroundColor="transparent" />
              <PushNotificationNavigator />
              <RememberRoute />
              <AppStack />
              <AppUpdateCard />
            </GradientBackground>
          </WishlistProvider>
        </CartProvider>
      </SessionProvider>
    </I18nProvider>
  );
}
