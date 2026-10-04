import { apiRequest } from './client';
import type { AdminIntroVideo, IntroVideoUploadTicket } from '../types';

export async function getIntroVideo(): Promise<AdminIntroVideo> {
  return apiRequest<AdminIntroVideo>('/api/admin/intro-video');
}

export async function requestIntroUploadUrl(data: {
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
}): Promise<IntroVideoUploadTicket> {
  return apiRequest<IntroVideoUploadTicket>('/api/admin/intro-video/upload-url', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function completeIntroUpload(data: {
  blobPath: string;
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
}): Promise<AdminIntroVideo> {
  return apiRequest<AdminIntroVideo>('/api/admin/intro-video/upload-complete', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function setIntroVideoEnabled(isEnabled: boolean): Promise<AdminIntroVideo> {
  return apiRequest<AdminIntroVideo>('/api/admin/intro-video/settings', {
    method: 'PUT',
    body: JSON.stringify({ isEnabled }),
  });
}

export async function deleteIntroVideo(): Promise<void> {
  await apiRequest<void>('/api/admin/intro-video', { method: 'DELETE' });
}
