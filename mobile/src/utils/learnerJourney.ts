import type { Enrollment } from '../api/enrollments';
import { MAIN_COURSE_CATALOG } from './mainCourses';

export type JourneyMilestoneStatus = 'locked' | 'owned' | 'in_progress' | 'finished';

export type JourneyMilestone = {
  courseId: string;
  /** Stable step index 0..2 for Foundation → Master */
  step: number;
  nameHint: string;
  shortLabel: string;
  badgeLabel: string;
  status: JourneyMilestoneStatus;
  progressPct: number;
  purchaseDate?: string;
  completedAt?: string | null;
};

export type LearnerJourneySnapshot = {
  milestones: JourneyMilestone[];
  purchasedCount: number;
  finishedCount: number;
  inProgressCount: number;
  /** Next unfinished owned course id, else first locked catalog id */
  nextCourseId: string | null;
  nextStep: number | null;
  /** All three main courses finished */
  journeyComplete: boolean;
};

const SHORT_LABELS = ['Foundation', 'Signature', 'Master'] as const;
const BADGE_LABELS = ['Starter Stitch', 'Signature Maker', 'Master Stitcher'] as const;

export function isLastLessonInCourse(
  lessons: { id: string; sortOrder: number }[],
  lessonId: string,
): boolean {
  if (!lessons.length) return false;
  const sorted = lessons.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  return sorted[sorted.length - 1]?.id === lessonId;
}

/** Next main-path course after a catalog course (Foundation → Signature → Master). */
export function getNextMainCourseEligibility(completedCourseId: string): {
  courseId: string;
  shortLabel: string;
  badgeLabel: string;
} | null {
  const idx = MAIN_COURSE_CATALOG.findIndex(
    (c) => c.id.toLowerCase() === completedCourseId.toLowerCase(),
  );
  if (idx < 0 || idx >= MAIN_COURSE_CATALOG.length - 1) return null;
  const next = MAIN_COURSE_CATALOG[idx + 1];
  return {
    courseId: next.id,
    shortLabel: SHORT_LABELS[idx + 1],
    badgeLabel: BADGE_LABELS[idx + 1],
  };
}

/**
 * Builds the three-step main-course journey from enrollments + local progress %.
 * Progress map keys are course ids; completedFlag wins over local %.
 */
export function buildLearnerJourney(
  enrollments: Enrollment[],
  progressByCourseId: Record<string, { progressPct: number }> = {},
): LearnerJourneySnapshot {
  const byCourse = new Map<string, Enrollment>();
  for (const enrollment of enrollments) {
    const existing = byCourse.get(enrollment.courseId);
    if (!existing) {
      byCourse.set(enrollment.courseId, enrollment);
      continue;
    }
    // Prefer completed, else newest purchase
    if (enrollment.completedFlag && !existing.completedFlag) {
      byCourse.set(enrollment.courseId, enrollment);
    } else if (
      !existing.completedFlag &&
      new Date(enrollment.purchaseDate).getTime() > new Date(existing.purchaseDate).getTime()
    ) {
      byCourse.set(enrollment.courseId, enrollment);
    }
  }

  const milestones: JourneyMilestone[] = MAIN_COURSE_CATALOG.map((entry, step) => {
    const enrollment = byCourse.get(entry.id);
    const localPct = progressByCourseId[entry.id]?.progressPct ?? 0;
    let status: JourneyMilestoneStatus = 'locked';
    let progressPct = 0;

    if (enrollment) {
      if (enrollment.completedFlag || localPct >= 95) {
        status = 'finished';
        progressPct = 100;
      } else if (enrollment.isActive && !enrollment.isExpired) {
        status = localPct > 8 ? 'in_progress' : 'owned';
        progressPct = Math.max(localPct, 8);
      } else {
        // Expired / inactive but purchased — still show as owned if not finished
        status = enrollment.completedFlag ? 'finished' : 'owned';
        progressPct = enrollment.completedFlag ? 100 : Math.min(localPct, 90);
      }
    }

    return {
      courseId: entry.id,
      step,
      nameHint: entry.nameHint,
      shortLabel: SHORT_LABELS[step] ?? entry.nameHint,
      badgeLabel: BADGE_LABELS[step] ?? entry.nameHint,
      status,
      progressPct,
      purchaseDate: enrollment?.purchaseDate,
      completedAt: enrollment?.completedAt,
    };
  });

  const purchasedCount = milestones.filter((m) => m.status !== 'locked').length;
  const finishedCount = milestones.filter((m) => m.status === 'finished').length;
  const inProgressCount = milestones.filter((m) => m.status === 'in_progress').length;

  const nextOwned = milestones.find(
    (m) => m.status === 'in_progress' || m.status === 'owned',
  );
  const nextLocked = milestones.find((m) => m.status === 'locked');
  const next = nextOwned ?? nextLocked ?? null;

  return {
    milestones,
    purchasedCount,
    finishedCount,
    inProgressCount,
    nextCourseId: next?.courseId ?? null,
    nextStep: next?.step ?? null,
    journeyComplete: finishedCount === milestones.length && milestones.length > 0,
  };
}
