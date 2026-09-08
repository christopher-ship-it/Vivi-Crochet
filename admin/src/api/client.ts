import type { ApiError } from '../types';
import { clearSession, loadSession } from '../auth/storage';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5080').replace(/\/$/, '');
const REQUEST_TIMEOUT_MS = 25_000;

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

function getToken(): string | null {
  return loadSession()?.accessToken ?? null;
}

async function parseError(response: Response): Promise<ApiClientError> {
  try {
    const body = (await response.json()) as ApiError;
    return new ApiClientError(response.status, body.code ?? 'UNKNOWN', body.message ?? response.statusText);
  } catch {
    return new ApiClientError(response.status, 'HTTP_ERROR', response.statusText || 'Request failed');
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  auth = true,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (auth) {
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      signal: options.signal ?? controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiClientError(
        0,
        'TIMEOUT',
        'The API took too long to respond. It may be waking up — try again in a moment.',
      );
    }
    throw new ApiClientError(0, 'NETWORK_ERROR', 'Could not reach the API. Check your connection and API URL.');
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 401 && auth) {
    clearSession();
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
