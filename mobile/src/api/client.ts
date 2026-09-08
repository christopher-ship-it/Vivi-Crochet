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

export function setUnauthorizedHandler(handler: OnUnauthorized): void {
  onUnauthorized = handler;
}

async function getToken(): Promise<string | null> {
  return (await loadShoppingSession())?.accessToken ?? null;
}

async function parseError(response: Response): Promise<ApiClientError> {
  try {
    const body = (await response.json()) as ApiError;
    return new ApiClientError(response.status, body.code ?? 'UNKNOWN', body.message ?? response.statusText);
  } catch {
    const fallback =
      response.status === 404
        ? 'This feature is not available on the server yet. The API may need to be updated.'
        : response.statusText || 'Request failed';
    return new ApiClientError(response.status, 'HTTP_ERROR', fallback);
  }
}

const DEFAULT_TIMEOUT_MS = 25_000;

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  auth = true,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (auth) {
    const token = await getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
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
    await clearShoppingSession();
    onUnauthorized?.();
    throw new ApiClientError(401, 'UNAUTHORIZED', 'Your session has expired. Please sign in again.');
  }

  if (!response.ok) {
    throw await parseError(response);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function getApiBaseUrl(): string {
  return API_BASE;
}
