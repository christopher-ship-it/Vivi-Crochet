import { useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { listProducts } from '../src/api/products';
import { AnimatedSplash, SPLASH_STAGE_COLOR, T_EXIT_AT_RETURNING } from '../src/components/AnimatedSplash';
import { loadStoredLanguage } from '../src/i18n/storage';
import { routeAfterSplash } from '../src/preferences/onboardingFlow';
import { loadStoredCountry } from '../src/preferences/storage';
import { wakeApi } from '../src/utils/wakeApi';

async function hideNativeSplash() {
  try {
    await SplashScreen.hideAsync();
  } catch {
    // Already hidden / not available.
  }
}

export default function SplashRoute() {
  const router = useRouter();
  const [showSplash, setShowSplash] = useState(true);
  // null until saved language + country are read; true means they go straight to Home.
  const [returning, setReturning] = useState<boolean | null>(null);
  const finishedRef = useRef(false);

  const leaveSplash = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setShowSplash(false);
    void hideNativeSplash();

    void (async () => {
      try {
        // New user: Language -> Country -> app. Returning user with both saved: straight in.
        // Someone missing one of them is asked only for that one.
        const [language, country] = await Promise.all([loadStoredLanguage(), loadStoredCountry()]);
        router.replace(routeAfterSplash(language, country));
      } catch {
        router.replace('/(tabs)');
      }
    })();
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadStoredLanguage(), loadStoredCountry()])
      .then(([language, country]) => {
        if (cancelled) return;
        const goesHome = Boolean(language && country);
        setReturning(goesHome);
        // Start Home's biggest request now; Home reuses it from the shared cache (see listProducts).
        if (goesHome) void listProducts(undefined, undefined, undefined, true).catch(() => undefined);
      })
      .catch(() => !cancelled && setReturning(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    wakeApi();

    // Hide native splash early; give yarn sequence time to finish before forcing exit.
    const hideId = setTimeout(() => void hideNativeSplash(), 1200);
    const leaveId = setTimeout(() => leaveSplash(), 7000);

    return () => {
      clearTimeout(hideId);
      clearTimeout(leaveId);
    };
  }, [leaveSplash]);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" translucent backgroundColor="transparent" />
      {showSplash && returning !== null ? (
        <AnimatedSplash
          onReady={() => void hideNativeSplash()}
          onFinish={leaveSplash}
          exitAtMs={returning ? T_EXIT_AT_RETURNING : undefined}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SPLASH_STAGE_COLOR,
  },
});
