import { apiRequest } from './client';
import type { UserMetrics } from '../types';

export async function getUserMetrics(): Promise<UserMetrics> {
  return apiRequest<UserMetrics>('/api/admin/user-metrics');
}
