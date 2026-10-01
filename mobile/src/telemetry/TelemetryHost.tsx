import { useGlobalSearchParams, usePathname, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import {
  errorToPayload,
  flushTaps,
  recordFatalCrash,
  reportIssue,
  setCurrentScreen,
  startTelemetry,
} from './telemetry';

type ErrorUtilsLike = {
  getGlobalHandler: () => (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler: (handler: (error: unknown, isFatal?: boolean) => void) => void;
};

/**
 * Tracks the current screen for tap/crash context, flushes taps when the app is backgrounded,
 * and reports uncaught JS errors. Renders nothing.
 */
export function TelemetryHost() {
  const segments = useSegments();
  // Subscribing keeps this in sync on navigation; segments (not pathname) group dynamic routes
  // such as /product/[id] into one heatmap screen.
  usePathname();
  useGlobalSearchParams();

  const screen = '/' + segments.filter((s) => !s.startsWith('(')).join('/');

  useEffect(() => {
    setCurrentScreen(screen === '/' ? 'home' : screen);
  }, [screen]);

  useEffect(() => {
    startTelemetry();

    const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
    const previous = errorUtils?.getGlobalHandler();
    errorUtils?.setGlobalHandler((error, isFatal) => {
      if (isFatal) void recordFatalCrash(error);
      else void reportIssue(errorToPayload(error, false));
      previous?.(error, isFatal);
    });

    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void flushTaps();
    });

    return () => {
      sub.remove();
      if (previous) errorUtils?.setGlobalHandler(previous);
    };
  }, []);

  return null;
}
