import type { VideoProgress } from '../api/videoProgress';

type LessonRef = { id: string; sortOrder?: number };

export type CourseWatchSummary = {
  /** The learner has watched part of, or finished, at least one lesson. */
  started: boolean;
  total: number;
  completedCount: number;
  /** The lesson to continue with (index into the sorted lessons), or -1 for an empty course. */
  currentIndex: number;
  currentLessonId: string | null;
  /** 0 to 100: how far through the current lesson. */
  currentPercent: number;
  /** 0 to 100 across the whole course: finished lessons plus the part watched of the others. */
  overallPercent: number;
  /** Progress of each lesson, by lesson id. */
  byLesson: Record<string, { percent: number; completed: boolean }>;
};

/** Below this the learner has only just opened the video; resume from the start. */
const RESUME_MIN_SECONDS = 5;
/** Start a little before where they stopped, so they get their bearings. */
const RESUME_REWIND_SECONDS = 3;

/** Where playback should start for a lesson: the saved spot, or 0 if there is nothing worth resuming. */
export function resumePositionFor(progress: VideoProgress | null | undefined): number {
  if (!progress || progress.isCompleted) return 0;
  if (progress.positionSeconds < RESUME_MIN_SECONDS) return 0;
  if (progress.durationSeconds > 0 && progress.positionSeconds >= progress.durationSeconds - 10) return 0;
  return Math.max(0, progress.positionSeconds - RESUME_REWIND_SECONDS);
}

export function summarizeCourseProgress(
  lessons: LessonRef[],
  progress: VideoProgress[],
): CourseWatchSummary {
  const sorted = lessons.slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const byVideo = new Map(progress.map((p) => [p.videoId, p]));

  const byLesson: CourseWatchSummary['byLesson'] = {};
  let completedCount = 0;
  let partial = 0;
  let started = false;
  for (const lesson of sorted) {
    const p = byVideo.get(lesson.id);
    const completed = Boolean(p?.isCompleted);
    const percent = completed ? 100 : Math.min(99, Math.max(0, p?.percent ?? 0));
    byLesson[lesson.id] = { percent, completed };
    if (completed) completedCount++;
    else partial += percent / 100;
    if (completed || (p?.positionSeconds ?? 0) > 0) started = true;
  }

  const total = sorted.length;
  let currentIndex = total > 0 ? 0 : -1;
  if (total > 0) {
    // Continue with whatever was watched most recently and not finished; otherwise the first unfinished lesson.
    const inProgress = sorted
      .map((lesson, index) => ({ index, p: byVideo.get(lesson.id) }))
      .filter((x) => x.p && !x.p.isCompleted && x.p.positionSeconds > 0)
      .sort((a, b) => b.p!.updatedAt.localeCompare(a.p!.updatedAt));
    if (inProgress.length > 0) {
      currentIndex = inProgress[0].index;
    } else {
      const firstUnfinished = sorted.findIndex((lesson) => !byLesson[lesson.id].completed);
      currentIndex = firstUnfinished >= 0 ? firstUnfinished : total - 1;
    }
  }

  const currentId = currentIndex >= 0 ? sorted[currentIndex].id : null;
  return {
    started,
    total,
    completedCount,
    currentIndex,
    currentLessonId: currentId,
    currentPercent: currentId ? byLesson[currentId].percent : 0,
    overallPercent: total > 0 ? Math.min(100, Math.round(((completedCount + partial) / total) * 100)) : 0,
    byLesson,
  };
}
