import { apiRequest } from './client';

/** Something a customer was looking for in the app and could not find. */
export interface AppFeedbackItem {
  id: string;
  message: string | null;
  screen: string | null;
  appVersion: string | null;
  platform: string | null;
  secondsInApp: number;
  createdAt: string;
  isResolved: boolean;
  resolvedAt: string | null;
}

export interface AppFeedbackSummary {
  total: number;
  last7Days: number;
  unresolved: number;
}

const BASE = '/api/admin/feedback';

export function getFeedbackSummary(): Promise<AppFeedbackSummary> {
  return apiRequest<AppFeedbackSummary>(`${BASE}/summary`);
}

export function listFeedback(status?: 'open' | 'resolved'): Promise<AppFeedbackItem[]> {
  const qs = status ? `?status=${status}` : '';
  return apiRequest<AppFeedbackItem[]>(`${BASE}${qs}`);
}

export async function setFeedbackResolved(id: string, resolved: boolean): Promise<void> {
  await apiRequest<AppFeedbackItem>(`${BASE}/${id}/resolved?resolved=${resolved}`, { method: 'PUT' });
}
