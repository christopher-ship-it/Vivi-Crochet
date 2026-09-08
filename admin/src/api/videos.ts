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
