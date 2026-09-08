import { getApiBaseUrl } from '../api/client';

/**
 * Fire-and-forget ping so Azure App Service can leave idle before the first real screen load.
 * Safe to call multiple times; never throws to callers.
 */
export function wakeApi(): void {
  const base = getApiBaseUrl();
  if (!base || base.includes('localhost') || base.includes('127.0.0.1')) return;

  void fetch(`${base}/api/health`, { method: 'GET' }).catch(() => {
    /* ignore — real screens handle their own errors */
  });
}
