import { useRouter, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AnimatedSplash } from '../src/components/AnimatedSplash';
import { loadStoredLanguage } from '../src/i18n/storage';
import { loadLastHref, wasRecentlyBackgrounded } from '../src/navigation/lastRoute';
import { wakeApi } from '../src/utils/wakeApi';

async function hideNativeSplash() {
  try {
    await SplashScreen.hideAsync();
  } catch {
    // Already hidden / not available (Expo Go edge cases).
  }
}

export default function SplashRoute() {
  const router = useRouter();
  // Mount branded splash immediately — never wait on AsyncStorage before paint.
  const [showSplash, setShowSplash] = useState(true);
  /** Screen to restore after the splash when the process was killed while backgrounded. */
  const resumeHref = useRef<string | null>(null);

  useEffect(() => {
    // Starts SQL resume during splash so Learn / Live / Shop rarely hit a cold DB.
    wakeApi();

    let cancelled = false;

    (async () => {
      const [lastHref, resume] = await Promise.all([loadLastHref(), wasRecentlyBackgrounded()]);
      if (cancelled) return;
      resumeHref.current = resume && lastHref ? lastHref : null;
    })();

    // If AnimatedSplash never mounts/reports ready, don't leave the native blush forever.
    const failsafeId = setTimeout(() => {
      void hideNativeSplash();
    }, 2500);

    return () => {
      cancelled = true;
      clearTimeout(failsafeId);
    };
  }, []);

  const handleReady = useCallback(() => {
    void hideNativeSplash();
  }, []);

  const handleFinish = useCallback(() => {
    setShowSplash(false);
    if (resumeHref.current) {
      router.replace(resumeHref.current as Href);
      return;
    }
    void (async () => {
      const stored = await loadStoredLanguage();
      if (stored) {
        router.replace('/(tabs)');
      } else {
        router.replace('/language-onboarding');
      }
    })();
  }, [router]);

  // Keep this view transparent while the native splash is still covering —
  // never paint a blank white frame before the branding splash.
  return (
    <View style={styles.root}>
      <StatusBar style="dark" translucent backgroundColor="transparent" />
      {showSplash && <AnimatedSplash onReady={handleReady} onFinish={handleFinish} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
