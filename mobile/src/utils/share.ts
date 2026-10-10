import { Share } from 'react-native';

/** Public web origin for share links; served by the API (see ShareController) and opens the app when installed. */
export const SHARE_ORIGIN = 'https://go.vivicrochet01.com';

export function buildShareUrl(kind: 'product' | 'course', id: string): string {
  return `${SHARE_ORIGIN}/${kind === 'product' ? 'p' : 'c'}/${id}`;
}

export async function shareLink(message: string, url: string): Promise<void> {
  try {
    await Share.share({ message: `${message}\n${url}`, url });
  } catch {
    // User cancelled or share unavailable.
  }
}
