import { apiRequest } from './client';

export interface AdminPushReach {
  activeDevices: number;
  activeCustomers: number;
}

export interface AdminBroadcastResult {
  sentToDevices: number;
}

export async function getPushReach(): Promise<AdminPushReach> {
  return apiRequest<AdminPushReach>('/api/admin/push/reach');
}

export async function broadcastPush(input: {
  title: string;
  body: string;
  screen: string;
}): Promise<AdminBroadcastResult> {
  return apiRequest<AdminBroadcastResult>('/api/admin/push/broadcast', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function sendWeeklyPushNow(): Promise<{ notified: number }> {
  return apiRequest<{ notified: number }>('/api/admin/push/weekly', {
    method: 'POST',
  });
}
