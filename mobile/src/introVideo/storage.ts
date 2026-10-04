import AsyncStorage from '@react-native-async-storage/async-storage';

/** Set the first time the intro preview is shown, so it never pops up again on this phone. */
export const INTRO_PREVIEW_SEEN_KEY = 'vivi_intro_preview_seen';

export async function hasSeenIntroPreview(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(INTRO_PREVIEW_SEEN_KEY)) === '1';
  } catch {
    // If storage is unreadable, do not risk showing the preview on every visit.
    return true;
  }
}

export async function markIntroPreviewSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(INTRO_PREVIEW_SEEN_KEY, '1');
  } catch {
    // Not saving only means the preview may show once more.
  }
}
