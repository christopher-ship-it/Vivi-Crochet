import type { Enrollment } from '../api/enrollments';
import type { Course, LinkedCourseSummary, Product, RecommendedEssentialSummary } from '../types';
import { MAIN_COURSE_CATALOG } from '../utils/mainCourses';

export const FOUNDATION_COURSE_ID = MAIN_COURSE_CATALOG[0].id;

export type CartCourseReco =
  | {
      kind: 'linked';
      eyebrow: 'learnThis';
      course: LinkedCourseSummary;
    }
  | {
      kind: 'foundation';
      eyebrow: 'learnCreate';
      courseId: string;
      course: Course | LinkedCourseSummary;
    };

export interface CartItemRecommendation {
  productId: string;
  essentials: RecommendedEssentialSummary[];
  course: CartCourseReco | null;
  /** Visual priority: course-first for learners-to-be; essentials-first for existing learners. */
  priority: 'course' | 'essentials';
}

function isActiveEnrollment(e: Enrollment): boolean {
  return e.isActive && !e.isExpired;
}

export function ownsCourse(enrollments: Enrollment[] | null, courseId: string): boolean {
  if (!enrollments) return false;
  return enrollments.some((e) => e.courseId === courseId && isActiveEnrollment(e));
}

export function hasAnyActiveCourse(enrollments: Enrollment[] | null): boolean {
  if (!enrollments) return false;
  return enrollments.some(isActiveEnrollment);
}

/**
 * Build per-Handmade-item cart recommendations.
 * Essentials come only from admin-configured product links (never inferred).
 * Course ownership uses enrollment entitlements (includes bundle-expanded access).
 */
export function buildCartRecommendations(args: {
  handmadeProducts: Product[];
  enrollments: Enrollment[] | null;
  foundationCourse: Course | null;
  cartProductIds: Set<string>;
}): Record<string, CartItemRecommendation> {
  const { handmadeProducts, enrollments, foundationCourse, cartProductIds } = args;
  const anyCourse = hasAnyActiveCourse(enrollments);
  const usedEssentialIds = new Set<string>();
  const result: Record<string, CartItemRecommendation> = {};

  for (const product of handmadeProducts) {
    if ((product.productType ?? 'Handmade') !== 'Handmade') continue;

    const essentials: RecommendedEssentialSummary[] = [];
    for (const e of product.recommendedEssentials ?? []) {
      if (e.availableStock <= 0) continue;
      if (cartProductIds.has(e.id)) continue;
      if (usedEssentialIds.has(e.id)) continue;
      usedEssentialIds.add(e.id);
      essentials.push(e);
      if (essentials.length >= 3) break;
    }

    let course: CartCourseReco | null = null;
    const linked = product.linkedCourse ?? null;

    if (!anyCourse) {
      // Logged out OR no active course access → learning recommendation first.
      if (linked) {
        course = { kind: 'linked', eyebrow: 'learnThis', course: linked };
      } else if (foundationCourse) {
        course = {
          kind: 'foundation',
          eyebrow: 'learnCreate',
          courseId: foundationCourse.id,
          course: foundationCourse,
        };
      } else {
        course = {
          kind: 'foundation',
          eyebrow: 'learnCreate',
          courseId: FOUNDATION_COURSE_ID,
          course: {
            id: FOUNDATION_COURSE_ID,
            name: 'Foundation Stitches',
            price: 0,
            videoCount: 0,
          },
        };
      }
    } else if (linked && !ownsCourse(enrollments, linked.id)) {
      // Has some course access but not this product's linked course.
      course = { kind: 'linked', eyebrow: 'learnThis', course: linked };
    }

    if (essentials.length === 0 && !course) continue;

    result[product.id] = {
      productId: product.id,
      essentials,
      course,
      priority: anyCourse ? 'essentials' : 'course',
    };
  }

  return result;
}
