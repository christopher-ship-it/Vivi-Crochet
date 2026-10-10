import { apiRequest } from './client';

export interface AppVersionInfo {
  /** Lowest app version allowed to run; empty means no forced update. */
  minVersion: string;
  storeUrl: string;
}

export async function getAppVersionInfo(): Promise<AppVersionInfo> {
  return apiRequest<AppVersionInfo>('/api/app/version', {}, false);
}
