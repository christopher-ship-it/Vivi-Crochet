/**
 * Pure rules for the first-launch Language -> Country flow. No React / storage imports, so
 * they can be unit-tested with `node --test`.
 *
 * Language and country are two independent preferences. Both are picked explicitly by the
 * user: nothing here (or anywhere in the flow) reads GPS or the device region.
 */

export type AppLanguageCode = 'en' | 'ta' | 'hi';
export type AppCountryCode = 'IN' | 'US';

export const SUPPORTED_LANGUAGE_CODES: readonly AppLanguageCode[] = ['en', 'ta', 'hi'];

/** `nameKey` is the i18n key for the display name; the stored value is always `code`. */
export const SUPPORTED_COUNTRIES: readonly {
  code: AppCountryCode;
  flag: string;
  nameKey: 'country.india' | 'country.unitedStates';
}[] = [
  { code: 'IN', flag: '🇮🇳', nameKey: 'country.india' },
  { code: 'US', flag: '🇺🇸', nameKey: 'country.unitedStates' },
];

export function isSupportedLanguage(value: unknown): value is AppLanguageCode {
  return value === 'en' || value === 'ta' || value === 'hi';
}

/** Country codes are stored upper-case; anything else (names, unknown codes) is rejected. */
export function isSupportedCountry(value: unknown): value is AppCountryCode {
  return value === 'IN' || value === 'US';
}

export type OnboardingRoute = '/language-onboarding' | '/country-onboarding' | '/(tabs)';

/**
 * Where the app goes after the splash. Returning users with both choices saved go straight
 * into the app; otherwise they are asked only for what is missing.
 */
export function routeAfterSplash(
  language: AppLanguageCode | null,
  country: AppCountryCode | null,
): OnboardingRoute {
  if (!language) return '/language-onboarding';
  if (!country) return '/country-onboarding';
  return '/(tabs)';
}

/** Where "Continue" on the language screen goes. */
export function routeAfterLanguage(country: AppCountryCode | null): OnboardingRoute {
  return country ? '/(tabs)' : '/country-onboarding';
}

/** The Continue button is only enabled once something is selected. */
export function canContinue(selected: string | null | undefined): boolean {
  return Boolean(selected);
}

export interface StoredPreferences {
  language: AppLanguageCode | null;
  country: AppCountryCode | null;
}

/**
 * What to send to the profile after sign-in. The choice made on this device wins; a value
 * missing on the device is not sent. Returns null when there is nothing to update.
 */
export function preferencesToPush(
  local: StoredPreferences,
  remote: { languageCode?: string | null; countryCode?: string | null },
): { languageCode?: AppLanguageCode; countryCode?: AppCountryCode } | null {
  const patch: { languageCode?: AppLanguageCode; countryCode?: AppCountryCode } = {};
  if (local.language && local.language !== remote.languageCode) patch.languageCode = local.language;
  if (local.country && local.country !== remote.countryCode) patch.countryCode = local.country;
  return Object.keys(patch).length > 0 ? patch : null;
}

/** Values to copy from the profile onto this device when the device has none of its own. */
export function preferencesToPull(
  local: StoredPreferences,
  remote: { languageCode?: string | null; countryCode?: string | null },
): { language?: AppLanguageCode; country?: AppCountryCode } {
  const pulled: { language?: AppLanguageCode; country?: AppCountryCode } = {};
  if (!local.language && isSupportedLanguage(remote.languageCode)) pulled.language = remote.languageCode;
  if (!local.country && isSupportedCountry(remote.countryCode)) pulled.country = remote.countryCode;
  return pulled;
}

const INDIA_TIME_ZONES = new Set(['Asia/Kolkata', 'Asia/Calcutta']);

/**
 * Best guess of the user's country from the device, used only to PRE-SELECT the Country screen.
 * The user still has to press Continue, and a saved choice always wins over this guess.
 *
 * The time zone is checked first: many phones in India are set to an "en-US" language, so the
 * locale's region alone would wrongly suggest the United States.
 */
export function suggestCountry(device: {
  timeZone?: string | null;
  locale?: string | null;
}): AppCountryCode | null {
  if (device.timeZone && INDIA_TIME_ZONES.has(device.timeZone)) return 'IN';

  const region = device.locale?.split(/[-_]/)[1]?.toUpperCase();
  return isSupportedCountry(region) ? region : null;
}
