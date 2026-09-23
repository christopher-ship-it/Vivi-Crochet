import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'vivi.coursePath.v1';
export const COURSE_PATH_GUEST_OWNER = 'guest';

function legacyKey(courseId: string) {
  return `${PREFIX}:${courseId}`;
}

function scopedKey(ownerId: string, courseId: string) {
  if (ownerId === COURSE_PATH_GUEST_OWNER) {
    return `${PREFIX}:guest:${courseId}`;
  }
  return `${PREFIX}:user:${ownerId}:${courseId}`;
}

export async function getCoursePathCursor(
  courseId: string,
  ownerId: string = COURSE_PATH_GUEST_OWNER,
): Promise<string | null> {
  try {
    const key = scopedKey(ownerId, courseId);
    const raw = await AsyncStorage.getItem(key);
    if (raw) return raw;

    // One-time: claim device-wide cursor for this signed-in user only.
    if (ownerId !== COURSE_PATH_GUEST_OWNER) {
      const legacy = await AsyncStorage.getItem(legacyKey(courseId));
      if (legacy) {
        await AsyncStorage.setItem(key, legacy);
        await AsyncStorage.removeItem(legacyKey(courseId));
        return legacy;
      }
    }

    return null;
  } catch {
    return null;
  }
}

export async function setCoursePathCursor(
  courseId: string,
  lessonId: string,
  ownerId: string = COURSE_PATH_GUEST_OWNER,
): Promise<void> {
  try {
    await AsyncStorage.setItem(scopedKey(ownerId, courseId), lessonId);
  } catch {
    // ignore storage failures
  }
}
