import { apiRequest } from './client';

export interface HealthCheck {
  name: string;
  ok: boolean;
  ms: number;
  error: string | null;
}

export interface RouteStats {
  route: string;
  count: number;
  clientErrors: number;
  serverErrors: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
}

export interface RecentServerError {
  at: string;
  route: string;
  status: number;
  exceptionType: string | null;
}

export interface BackendCheck {
  startedAt: string;
  uptimeSeconds: number;
  totalRequests: number;
  clientErrors: number;
  serverErrors: number;
  memoryMb: number;
  threadPoolQueued: number;
  checks: HealthCheck[];
  routes: RouteStats[];
  recentServerErrors: RecentServerError[];
}

export function getBackendCheck(): Promise<BackendCheck> {
  return apiRequest<BackendCheck>('/api/admin/backend-check');
}
