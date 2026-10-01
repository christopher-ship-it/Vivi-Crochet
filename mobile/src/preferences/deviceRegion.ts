import { suggestCountry, type AppCountryCode } from './onboardingFlow';

/** Reads the device time zone / locale (no permission needed) and suggests a supported country. */
export function detectDeviceCountry(): AppCountryCode | null {
  try {
    const options = Intl.DateTimeFormat().resolvedOptions();
    return suggestCountry({ timeZone: options.timeZone, locale: options.locale });
  } catch {
    return null;
  }
}
