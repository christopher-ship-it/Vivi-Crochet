import { apiRequest } from './client';
import type { UserMetrics, UserMetricsUser } from '../types';

export async function getUserMetrics(): Promise<UserMetrics> {
  return apiRequest<UserMetrics>('/api/admin/user-metrics');
}

export async function getUserMetricsUsers(date: string, kind: 'new' | 'active' | 'total'): Promise<UserMetricsUser[]> {
  return apiRequest<UserMetricsUser[]>(`/api/admin/user-metrics/users?date=${date}&kind=${kind}`);
}
