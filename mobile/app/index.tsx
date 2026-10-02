import { useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AnimatedSplash, SPLASH_STAGE_COLOR } from '../src/components/AnimatedSplash';
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
      {showSplash ? (
        <AnimatedSplash onReady={() => void hideNativeSplash()} onFinish={leaveSplash} />
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
