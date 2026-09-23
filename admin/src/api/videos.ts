import { apiRequest } from './client';
import type {
  UpdateVideoRequest,
  UploadUrlRequest,
  UploadUrlResponse,
  Video,
} from '../types';

export async function listVideos(courseId?: string): Promise<Video[]> {
  const query = courseId ? `?courseId=${courseId}` : '';
  return apiRequest<Video[]>(`/api/videos${query}`);
}

export async function getVideo(id: string): Promise<Video> {
  return apiRequest<Video>(`/api/videos/${id}`);
}

export async function requestUploadUrl(data: UploadUrlRequest): Promise<UploadUrlResponse> {
  return apiRequest<UploadUrlResponse>('/api/videos/upload-url', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function completeUpload(videoId: string): Promise<Video> {
  return apiRequest<Video>(`/api/videos/${videoId}/upload-complete`, { method: 'POST' });
}

export async function updateVideo(id: string, data: UpdateVideoRequest): Promise<Video> {
  return apiRequest<Video>(`/api/videos/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteVideo(id: string): Promise<void> {
  return apiRequest<void>(`/api/videos/${id}`, { method: 'DELETE' });
}

export async function publishVideo(id: string): Promise<Video> {
  return apiRequest<Video>(`/api/videos/${id}/publish`, { method: 'POST' });
}

export async function unpublishVideo(id: string): Promise<Video> {
  return apiRequest<Video>(`/api/videos/${id}/unpublish`, { method: 'POST' });
}

export async function requeueVideoTranscode(id: string): Promise<Video> {
  return apiRequest<Video>(`/api/videos/${id}/requeue-transcode`, { method: 'POST' });
}

export async function getStreamUrl(id: string): Promise<{ streamUrl: string }> {
  return apiRequest<{ streamUrl: string }>(`/api/videos/${id}/stream-url`);
}

export async function reportVideoDuration(id: string, durationSeconds: number): Promise<Video> {
  return apiRequest<Video>(`/api/videos/${id}/report-duration`, {
    method: 'POST',
    body: JSON.stringify({ durationSeconds }),
  });
}
