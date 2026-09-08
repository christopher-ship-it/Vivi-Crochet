import { Archivo_400Regular, Archivo_600SemiBold, Archivo_800ExtraBold, useFonts } from '@expo-google-fonts/archivo';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SessionProvider } from '../src/auth/SessionContext';
import { CartProvider } from '../src/cart/CartContext';
import { AppUpdateCard } from '../src/components/AppUpdateCard';
import { colors } from '../src/theme';
import { applyStatusBar } from '../src/utils/statusBar';

export default function RootLayout() {
  const [loaded] = useFonts({
    Archivo_400Regular,
    Archivo_600SemiBold,
    Archivo_800ExtraBold,
  });

  useEffect(() => {
    // Default: dark icons on cream screens (Android network/battery visible)
    applyStatusBar('dark');
  }, []);

  if (!loaded) return null;

  return (
    <SessionProvider>
      <CartProvider>
        <View style={{ flex: 1 }}>
          <StatusBar style="dark" backgroundColor={colors.white} />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.white },
              headerTintColor: colors.pink,
              headerTitleStyle: { fontFamily: 'Archivo_800ExtraBold', color: colors.ink },
              contentStyle: { backgroundColor: colors.white },
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false, animation: 'none' }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="login" options={{ headerShown: false, presentation: 'modal' }} />
            <Stack.Screen name="edit-address" options={{ title: 'Saved address' }} />
            <Stack.Screen name="cart" options={{ title: 'Your cart' }} />
            <Stack.Screen name="checkout" options={{ title: 'Checkout' }} />
            <Stack.Screen name="product/[id]" options={{ title: 'Product' }} />
            <Stack.Screen name="order-confirmation" options={{ title: 'Order confirmed', headerBackVisible: false }} />
            <Stack.Screen name="live-booking-confirmation" options={{ title: 'Booking confirmed', headerBackVisible: false }} />
            <Stack.Screen name="order/[id]" options={{ title: 'Order tracking' }} />
            <Stack.Screen name="course/[id]" options={{ title: 'Course' }} />
            <Stack.Screen name="lesson/[id]" options={{ title: 'Lesson' }} />
          </Stack>
          <AppUpdateCard />
        </View>
      </CartProvider>
    </SessionProvider>
  );
}
