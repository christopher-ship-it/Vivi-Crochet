import AsyncStorage from '@react-native-async-storage/async-storage';

const HREF_KEY = 'vivi.nav.lastHref';
const BG_AT_KEY = 'vivi.nav.backgroundedAt';

/**
 * Routes that should never be restored after a process kill.
 * Legal / settings sub-screens are short-lived — restoring them makes Back exit the app.
 */
const SKIP_PREFIXES = [
  '/',
  '/login',
  '/language-onboarding',
  '/privacy-policy',
  '/terms',
  '/delete-account',
  '/help-center',
  '/support-chat',
  '/profile-settings',
  '/edit-account',
] as const;

function shouldSkip(pathname: string): boolean {
  if (!pathname || pathname === '/') return true;
  const path = pathname.split('?')[0] ?? pathname;
  return SKIP_PREFIXES.some((p) => p !== '/' && (path === p || path.startsWith(`${p}/`)));
}

export function buildHref(
  pathname: string,
  params: Record<string, string | string[] | undefined>,
): string | null {
  if (shouldSkip(pathname)) return null;

  const query = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    if (raw == null) continue;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value) continue;
    // Path params are already in the pathname (e.g. /course/<id>).
    if (pathname.includes(value)) continue;
    query.set(key, value);
  }

  const qs = query.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export async function saveLastHref(href: string | null): Promise<void> {
  if (!href || shouldSkip(href.split('?')[0] ?? href)) return;
  try {
    await AsyncStorage.setItem(HREF_KEY, href);
  } catch {
    // Ignore storage failures — navigation still works.
  }
}

export async function loadLastHref(): Promise<string | null> {
  try {
    const href = await AsyncStorage.getItem(HREF_KEY);
    if (!href || shouldSkip(href.split('?')[0] ?? href)) return null;
    // Normalize home deep links. `/(tabs)/index` can show Unmatched Route on device;
    // bare `/(tabs)` + tabs `unstable_settings.initialRouteName` opens Home.
    const path = href.split('?')[0] ?? href;
    if (path === '/(tabs)' || path === '/(tabs)/' || path === '/(tabs)/index') {
      return '/(tabs)';
    }
    return href;
  } catch {
    return null;
  }
}

export async function markAppBackgrounded(): Promise<void> {
  try {
    await AsyncStorage.setItem(BG_AT_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

/** True when we left the app recently (process may have been killed and restarted). */
export async function wasRecentlyBackgrounded(maxAgeMs = 45 * 60 * 1000): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(BG_AT_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at <= maxAgeMs;
  } catch {
    return false;
  }
}
