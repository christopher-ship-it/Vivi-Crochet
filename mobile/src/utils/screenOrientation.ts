/**
 * Thin wrapper over expo-screen-orientation. Loaded lazily and wrapped in try/catch so a build
 * that doesn't contain the native module yet (older dev client / store build) keeps working —
 * fullscreen then just stays portrait instead of crashing.
 */
type OrientationModule = typeof import('expo-screen-orientation');

let cached: OrientationModule | null | undefined;

function load(): OrientationModule | null {
  if (cached === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      cached = require('expo-screen-orientation') as OrientationModule;
    } catch {
      cached = null;
    }
  }
  return cached;
}

async function lock(pick: (m: OrientationModule) => number): Promise<void> {
  const m = load();
  if (!m) return;
  try {
    await m.lockAsync(pick(m));
  } catch {
    // Unsupported on this device/build — ignore.
  }
}

export function lockPortrait() {
  return lock((m) => m.OrientationLock.PORTRAIT_UP);
}

export function lockLandscape() {
  return lock((m) => m.OrientationLock.LANDSCAPE);
}
