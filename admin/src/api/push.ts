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

export interface PushImageUploadUrl {
  uploadUrl: string;
  expiresAt: string;
  blobPath: string;
  maxFileSizeBytes: number;
}

/** Starts a picture upload for a notification. Same flow as the tutor photo. */
export async function requestPushImageUploadUrl(data: {
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
}): Promise<PushImageUploadUrl> {
  return apiRequest<PushImageUploadUrl>('/api/admin/push/image-upload-url', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** Confirms the picture is stored and returns the link to send with the notification. */
export async function completePushImageUpload(data: {
  blobPath: string;
  fileSizeBytes: number;
  contentType: string;
}): Promise<{ imageUrl: string }> {
  return apiRequest<{ imageUrl: string }>('/api/admin/push/image-upload-complete', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function broadcastPush(input: {
  title: string;
  body: string;
  screen: string;
  imageUrl?: string;
  customerId?: string;
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
