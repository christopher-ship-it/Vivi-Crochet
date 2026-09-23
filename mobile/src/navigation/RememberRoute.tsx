import { usePathname, useGlobalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { buildHref, markAppBackgrounded, saveLastHref } from './lastRoute';

/**
 * Persists the current route so a process kill (common when switching apps on
 * Android) can restore the user instead of replaying splash → Home.
 */
export function RememberRoute() {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const latestHref = useRef<string | null>(null);

  useEffect(() => {
    const href = buildHref(pathname, params as Record<string, string | string[] | undefined>);
    latestHref.current = href;
    if (href) void saveLastHref(href);
  }, [pathname, params]);

  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'background' || state === 'inactive') {
        void markAppBackgrounded();
        if (latestHref.current) void saveLastHref(latestHref.current);
      }
    };

    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, []);

  return null;
}
