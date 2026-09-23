import * as SecureStore from 'expo-secure-store';

const REGISTRATION_DRAFT_KEY = 'vivi_registration_draft';

export type AuthRegion = 'india' | 'international';
export type AuthMethod = 'phone_otp' | 'email_password';

/**
 * Local registration profile fields that the backend Customer model
 * does not yet persist (age, account-level geo, auth method).
 * Never store passwords here.
 */
export interface RegistrationDraft {
  region: AuthRegion;
  age: number;
  country: string;
  state?: string;
  city?: string;
  authMethod: AuthMethod;
  phone?: string;
  email?: string;
  updatedAt: string;
}

export async function loadRegistrationDraft(): Promise<RegistrationDraft | null> {
  try {
    const raw = await SecureStore.getItemAsync(REGISTRATION_DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RegistrationDraft;
  } catch {
    return null;
  }
}

export async function saveRegistrationDraft(draft: RegistrationDraft): Promise<void> {
  await SecureStore.setItemAsync(
    REGISTRATION_DRAFT_KEY,
    JSON.stringify({ ...draft, updatedAt: new Date().toISOString() }),
  );
}

export async function clearRegistrationDraft(): Promise<void> {
  await SecureStore.deleteItemAsync(REGISTRATION_DRAFT_KEY);
}
