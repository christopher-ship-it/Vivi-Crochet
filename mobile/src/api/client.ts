import type { ApiError } from '../types';
import { clearShoppingSession, loadShoppingSession } from '../auth/storage';

const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:5080').replace(/\/$/, '');

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
  }
}

type OnUnauthorized = () => void;
let onUnauthorized: OnUnauthorized | null = null;

/** In-memory token kept in sync with SessionContext so API calls match UI auth state. */
let memoryAccessToken: string | null = null;

export function setUnauthorizedHandler(handler: OnUnauthorized): void {
  onUnauthorized = handler;
}

export function setMemoryAccessToken(token: string | null): void {
  memoryAccessToken = token;
}

export function getMemoryAccessToken(): string | null {
  return memoryAccessToken;
}

async function getToken(): Promise<string | null> {
  if (memoryAccessToken) return memoryAccessToken;
  const session = await loadShoppingSession();
  memoryAccessToken = session?.accessToken ?? null;
  return memoryAccessToken;
}

async function parseError(response: Response): Promise<ApiClientError> {
  if (response.status === 429) {
    return new ApiClientError(
      429,
      'RATE_LIMITED',
      'Too many attempts. Please wait a few minutes and try again.',
    );
  }
  try {
    const body = (await response.json()) as ApiError & {
      title?: string;
      errors?: Record<string, string[] | string>;
    };

    const validationMessages = body.errors
      ? Object.values(body.errors)
          .flatMap((v) => (Array.isArray(v) ? v : [v]))
          .map((m) => String(m).trim())
          .filter(Boolean)
      : [];

    const message =
      (body.message && String(body.message).trim()) ||
      (validationMessages.length > 0 ? validationMessages.join(' ') : '') ||
      (body.title && String(body.title).trim()) ||
      response.statusText ||
      'Request failed';

    return new ApiClientError(
      response.status,
      body.code ?? (validationMessages.length > 0 ? 'VALIDATION_ERROR' : 'UNKNOWN'),
      message,
    );
  } catch {
    const fallback =
      response.status === 404
        ? 'This feature is not available on the server yet. The API may need to be updated.'
        : response.statusText || 'Request failed';
    return new ApiClientError(response.status, 'HTTP_ERROR', fallback);
  }
}

/** Allows slow first responses if the API or DB is under load; fail eventually. */
const DEFAULT_TIMEOUT_MS = 60_000;

function isSessionInvalidError(err: ApiClientError): boolean {
  return (
    err.code === 'CUSTOMER_ONLY'
    || err.code === 'SESSION_INVALID'
    || err.message.toLowerCase().includes('requires a customer account')
  );
}

async function clearSessionIfCurrent(usedToken: string | null): Promise<void> {
  // Avoid wiping a freshly saved login when an older in-flight request returns 401.
  const current = memoryAccessToken ?? (await loadShoppingSession())?.accessToken ?? null;
  if (usedToken && current && usedToken !== current) return;
  memoryAccessToken = null;
  await clearShoppingSession();
  onUnauthorized?.();
}

async function apiRequestOnce<T>(
  path: string,
  options: RequestInit,
  auth: boolean,
  timeoutMs: number,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  let usedToken: string | null = null;
  if (auth) {
    usedToken = await getToken();
    if (usedToken) headers.set('Authorization', `Bearer ${usedToken}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      signal: options.signal ?? controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiClientError(
        0,
        'TIMEOUT',
        'The server took too long to respond. It may be waking up — pull to refresh and try again.',
      );
    }
    throw new ApiClientError(
      0,
      'NETWORK_ERROR',
      'Unable to connect. Check your internet connection and try again.',
    );
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 401 && auth) {
    await clearSessionIfCurrent(usedToken);
    throw new ApiClientError(401, 'UNAUTHORIZED', 'Your session has expired. Please sign in again.');
  }

  if (!response.ok) {
    const err = await parseError(response);
    if (auth && isSessionInvalidError(err)) {
      await clearSessionIfCurrent(usedToken);
      throw new ApiClientError(
        401,
        'SESSION_INVALID',
        'Please sign in again with your phone number to continue.',
      );
    }
    throw err;
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function shouldRetryTransient(err: unknown): boolean {
  return (
    err instanceof ApiClientError &&
    (err.code === 'TIMEOUT' || err.code === 'NETWORK_ERROR' || err.status === 500)
  );
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  auth = true,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  try {
    return await apiRequestOnce<T>(path, options, auth, timeoutMs);
  } catch (err) {
    if (!shouldRetryTransient(err)) throw err;
    return apiRequestOnce<T>(path, options, auth, timeoutMs);
  }
}

export function getApiBaseUrl(): string {
  return API_BASE;
}
