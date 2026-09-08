import * as SecureStore from 'expo-secure-store';
import type { User } from '../types';

const SHOPPING_TOKEN_KEY = 'vivi_shopping_access_token';
const SHOPPING_USER_KEY = 'vivi_shopping_user';
const SHOPPING_EXPIRES_KEY = 'vivi_shopping_expires_at';
const LEARNING_CUSTOMER_KEY = 'vivi_learning_customer';

/** Legacy keys — migrated on first load. */
const LEGACY_TOKEN_KEY = 'vivi_access_token';
const LEGACY_USER_KEY = 'vivi_user';
const LEGACY_EXPIRES_KEY = 'vivi_expires_at';

export interface StoredSession {
  accessToken: string;
  expiresAt: string;
  user: User;
}

export interface LearningCustomerProfile {
  fullName: string;
  phone: string;
  email: string;
}

async function migrateLegacySession(): Promise<StoredSession | null> {
  const accessToken = await SecureStore.getItemAsync(LEGACY_TOKEN_KEY);
  const userRaw = await SecureStore.getItemAsync(LEGACY_USER_KEY);
  const expiresAt = await SecureStore.getItemAsync(LEGACY_EXPIRES_KEY);
  if (!accessToken || !userRaw || !expiresAt) return null;

  const session: StoredSession = {
    accessToken,
    expiresAt,
    user: JSON.parse(userRaw) as User,
  };
  await saveShoppingSession(session);
  await SecureStore.deleteItemAsync(LEGACY_TOKEN_KEY);
  await SecureStore.deleteItemAsync(LEGACY_USER_KEY);
  await SecureStore.deleteItemAsync(LEGACY_EXPIRES_KEY);
  return session;
}

export async function loadShoppingSession(): Promise<StoredSession | null> {
  try {
    let accessToken = await SecureStore.getItemAsync(SHOPPING_TOKEN_KEY);
    let userRaw = await SecureStore.getItemAsync(SHOPPING_USER_KEY);
    let expiresAt = await SecureStore.getItemAsync(SHOPPING_EXPIRES_KEY);

    if (!accessToken || !userRaw || !expiresAt) {
      return migrateLegacySession();
    }

    const user = JSON.parse(userRaw) as User;
    if (new Date(expiresAt).getTime() <= Date.now()) {
      await clearShoppingSession();
      return null;
    }
    return { accessToken, expiresAt, user };
  } catch {
    return null;
  }
}

export async function saveShoppingSession(session: StoredSession): Promise<void> {
  await SecureStore.setItemAsync(SHOPPING_TOKEN_KEY, session.accessToken);
  await SecureStore.setItemAsync(SHOPPING_USER_KEY, JSON.stringify(session.user));
  await SecureStore.setItemAsync(SHOPPING_EXPIRES_KEY, session.expiresAt);
}

export async function clearShoppingSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SHOPPING_TOKEN_KEY);
  await SecureStore.deleteItemAsync(SHOPPING_USER_KEY);
  await SecureStore.deleteItemAsync(SHOPPING_EXPIRES_KEY);
}

export async function loadLearningCustomer(): Promise<LearningCustomerProfile | null> {
  try {
    const raw = await SecureStore.getItemAsync(LEARNING_CUSTOMER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LearningCustomerProfile;
  } catch {
    return null;
  }
}

export async function saveLearningCustomer(profile: LearningCustomerProfile): Promise<void> {
  await SecureStore.setItemAsync(LEARNING_CUSTOMER_KEY, JSON.stringify(profile));
}

export async function clearLearningCustomer(): Promise<void> {
  await SecureStore.deleteItemAsync(LEARNING_CUSTOMER_KEY);
}

/** @deprecated Use clearShoppingSession */
export async function clearSession(): Promise<void> {
  await clearShoppingSession();
}

/** @deprecated Use loadShoppingSession */
export async function loadSession(): Promise<StoredSession | null> {
  return loadShoppingSession();
}

/** @deprecated Use saveShoppingSession */
export async function saveSession(session: StoredSession): Promise<void> {
  await saveShoppingSession(session);
}
