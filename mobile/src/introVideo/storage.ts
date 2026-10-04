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

/** Set once the person opens the intro video; after that the icon stops drawing attention. */
export const INTRO_WATCHED_KEY = 'vivi_intro_watched';
/** How many visits to Home have shown the "Watch intro" label. */
export const INTRO_LABEL_VIEWS_KEY = 'vivi_intro_label_views';
/** The label is shown on this many visits, then only the icon is left. */
export const INTRO_LABEL_MAX_VIEWS = 3;

export async function hasWatchedIntro(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(INTRO_WATCHED_KEY)) === '1';
  } catch {
    return true;
  }
}

export async function markIntroWatched(): Promise<void> {
  try {
    await AsyncStorage.setItem(INTRO_WATCHED_KEY, '1');
  } catch {
    // Not saving only means the icon keeps pulsing a little longer.
  }
}

/** Counts this visit and says whether the label should still be shown on it. */
export async function registerIntroLabelView(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(INTRO_LABEL_VIEWS_KEY);
    const views = Number.parseInt(raw ?? '0', 10) || 0;
    if (views >= INTRO_LABEL_MAX_VIEWS) return false;
    await AsyncStorage.setItem(INTRO_LABEL_VIEWS_KEY, String(views + 1));
    return true;
  } catch {
    return false;
  }
}
