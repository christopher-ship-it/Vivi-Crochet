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
