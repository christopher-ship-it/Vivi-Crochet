import { apiRequest } from './client';
import type { StreamUrlResponse, Video } from '../types';

export async function listVideos(courseId: string): Promise<Video[]> {
  return apiRequest<Video[]>(`/api/videos?courseId=${courseId}`, {}, false);
}

export async function getVideo(id: string): Promise<Video> {
  return apiRequest<Video>(`/api/videos/${id}`, {}, false);
}

export async function getStreamUrl(id: string, requireAuth = true): Promise<StreamUrlResponse> {
  return apiRequest<StreamUrlResponse>(`/api/videos/${id}/stream-url`, {}, requireAuth);
}

/** Saves real player duration when the lesson still has no DurationSeconds. */
export async function reportVideoDuration(
  id: string,
  durationSeconds: number,
  requireAuth = true,
): Promise<Video> {
  return apiRequest<Video>(
    `/api/videos/${id}/report-duration`,
    {
      method: 'POST',
      body: JSON.stringify({ durationSeconds }),
    },
    requireAuth,
  );
}
