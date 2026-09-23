import { getApiBaseUrl } from '../api/client';

const WAKE_TIMEOUT_MS = 60_000;

/** Lightweight anonymous endpoint that touches the database (unlike /api/health). */
const WAKE_DB_PATH = '/api/categories';

let wakePromise: Promise<boolean> | null = null;

/**
 * Fire-and-forget ping so the API (and DB, if needed) are ready before the first screen load.
 * Safe to call multiple times; never throws to callers.
 */
export function wakeApi(): void {
  void ensureApiAwake();
}

/** Shared wake used by splash; resolves true if the DB ping succeeded. */
export function ensureApiAwake(): Promise<boolean> {
  if (wakePromise) return wakePromise;

  const base = getApiBaseUrl();
  if (!base || base.includes('localhost') || base.includes('127.0.0.1')) {
    wakePromise = Promise.resolve(true);
    return wakePromise;
  }

  wakePromise = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WAKE_TIMEOUT_MS);
    try {
      void fetch(`${base}/api/health`, { method: 'GET', signal: controller.signal }).catch(() => {});
      const res = await fetch(`${base}${WAKE_DB_PATH}`, {
        method: 'GET',
        signal: controller.signal,
      });
      if (!res.ok) wakePromise = null;
      return res.ok;
    } catch {
      wakePromise = null;
      return false;
    } finally {
      clearTimeout(timer);
    }
  })();

  return wakePromise;
}
