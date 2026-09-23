import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppLanguage } from './types';

export const LANGUAGE_STORAGE_KEY = 'vivi_language';

const SUPPORTED: AppLanguage[] = ['en', 'ta', 'hi'];

export function isAppLanguage(value: string | null | undefined): value is AppLanguage {
  return value === 'en' || value === 'ta' || value === 'hi';
}

export async function loadStoredLanguage(): Promise<AppLanguage | null> {
  try {
    const raw = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isAppLanguage(raw) ? raw : null;
  } catch {
    return null;
  }
}

export async function saveStoredLanguage(language: AppLanguage): Promise<void> {
  try {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Persistence failure should not block UI language change.
  }
}

export { SUPPORTED as SUPPORTED_LANGUAGES };
