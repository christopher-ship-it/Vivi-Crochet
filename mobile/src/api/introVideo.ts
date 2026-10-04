import { apiRequest } from './client';

export interface IntroVideo {
  available: boolean;
  /** A temporary link to the compressed video. */
  url?: string | null;
  /** Changes whenever the video is replaced. */
  version: number;
}

/** Public: whether the welcome video is set up and switched on, and where to play it. */
export async function getIntroVideo(): Promise<IntroVideo> {
  return apiRequest<IntroVideo>('/api/intro-video', {}, false);
}
