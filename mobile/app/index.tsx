import { useRouter, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AnimatedSplash, SPLASH_STAGE_COLOR } from '../src/components/AnimatedSplash';
import { loadStoredLanguage } from '../src/i18n/storage';
import { loadLastHref, wasRecentlyBackgrounded } from '../src/navigation/lastRoute';
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
  const resumeHref = useRef<string | null>(null);
  const finishedRef = useRef(false);

  const leaveSplash = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setShowSplash(false);
    void hideNativeSplash();

    if (resumeHref.current) {
      router.replace(resumeHref.current as Href);
      return;
    }
    void (async () => {
      try {
        const stored = await loadStoredLanguage();
        router.replace(stored ? '/(tabs)' : '/language-onboarding');
      } catch {
        router.replace('/(tabs)');
      }
    })();
  }, [router]);

  useEffect(() => {
    wakeApi();

    let cancelled = false;
    (async () => {
      try {
        const [lastHref, resume] = await Promise.all([loadLastHref(), wasRecentlyBackgrounded()]);
        if (!cancelled) resumeHref.current = resume && lastHref ? lastHref : null;
      } catch {
        // Ignore — still leave splash via animation / failsafe.
      }
    })();

    const hideId = setTimeout(() => void hideNativeSplash(), 1200);
    const leaveId = setTimeout(() => leaveSplash(), 4500);

    return () => {
      cancelled = true;
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
