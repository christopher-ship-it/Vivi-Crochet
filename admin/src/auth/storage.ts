const TOKEN_KEY = 'vivi_admin_token';
const USER_KEY = 'vivi_admin_user';
const EXPIRES_KEY = 'vivi_admin_expires';

export interface StoredSession {
  accessToken: string;
  expiresAt: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

export function loadSession(): StoredSession | null {
  const accessToken = sessionStorage.getItem(TOKEN_KEY);
  const userRaw = sessionStorage.getItem(USER_KEY);
  const expiresAt = sessionStorage.getItem(EXPIRES_KEY);
  if (!accessToken || !userRaw || !expiresAt) return null;

  try {
    const user = JSON.parse(userRaw) as StoredSession['user'];
    if (new Date(expiresAt).getTime() <= Date.now()) {
      clearSession();
      return null;
    }
    return { accessToken, expiresAt, user };
  } catch {
    clearSession();
    return null;
  }
}

export function saveSession(session: StoredSession): void {
  sessionStorage.setItem(TOKEN_KEY, session.accessToken);
  sessionStorage.setItem(USER_KEY, JSON.stringify(session.user));
  sessionStorage.setItem(EXPIRES_KEY, session.expiresAt);
}

export function clearSession(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(EXPIRES_KEY);
}
