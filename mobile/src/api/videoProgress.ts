import { apiRequest } from './client';

/** How far the signed-in learner has watched one lesson video. */
export interface VideoProgress {
  videoId: string;
  courseId: string;
  positionSeconds: number;
  durationSeconds: number;
  isCompleted: boolean;
  /** 0 to 100; always 100 once completed. */
  percent: number;
  updatedAt: string;
}

export function saveVideoProgress(
  videoId: string,
  positionSeconds: number,
  durationSeconds: number,
): Promise<VideoProgress> {
  return apiRequest<VideoProgress>(`/api/me/video-progress/${videoId}`, {
    method: 'PUT',
    body: JSON.stringify({
      positionSeconds: Math.max(0, Math.round(positionSeconds)),
      durationSeconds: Math.max(1, Math.round(durationSeconds)),
    }),
  });
}

/** Progress for every video of a course the learner has started (empty if none). */
export function getCourseVideoProgress(courseId: string): Promise<VideoProgress[]> {
  return apiRequest<VideoProgress[]>(`/api/me/courses/${courseId}/video-progress`);
}
