import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSupportedCountry, type AppCountryCode } from './onboardingFlow';

/** Language is stored by the i18n layer ('vivi_language'); country lives beside it. */
export const COUNTRY_STORAGE_KEY = 'vivi_country';

export async function loadStoredCountry(): Promise<AppCountryCode | null> {
  try {
    const raw = await AsyncStorage.getItem(COUNTRY_STORAGE_KEY);
    return isSupportedCountry(raw) ? raw : null;
  } catch {
    return null;
  }
}

export async function saveStoredCountry(country: AppCountryCode): Promise<void> {
  try {
    await AsyncStorage.setItem(COUNTRY_STORAGE_KEY, country);
  } catch {
    // Persistence failure should not block the flow.
  }
}

/** Set when a first-time user has been sent to the Offers tab, so it happens only once. */
export const OFFERS_LANDING_KEY = 'vivi_offers_landing_done';

export async function hasLandedOnOffers(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(OFFERS_LANDING_KEY)) === '1';
  } catch {
    // If storage cannot be read, go to Home rather than risk sending someone to Offers again.
    return true;
  }
}

export async function markLandedOnOffers(): Promise<void> {
  try {
    await AsyncStorage.setItem(OFFERS_LANDING_KEY, '1');
  } catch {
    // Not saving only means a repeat of the Offers landing next time.
  }
}
