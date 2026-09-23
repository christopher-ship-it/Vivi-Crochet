import type { Course, Product } from '../types';

/**
 * Stable catalog ids from backend DatabaseSeeder.Catalog.
 * Used to pin the three structured Learn courses in the client-requested order.
 */
export const MAIN_COURSE_CATALOG = [
  {
    id: 'c0a1f001-0001-4000-8000-000000000001',
    nameHint: 'foundation stitches',
    whatYouGetKey: 'learn.whatYouGetFoundation' as const,
  },
  {
    id: 'c0a1f001-0001-4000-8000-000000000002',
    nameHint: 'signature stitches',
    whatYouGetKey: 'learn.whatYouGetSignature' as const,
  },
  {
    id: 'c0a1f001-0001-4000-8000-000000000003',
    nameHint: 'master stitch',
    whatYouGetKey: 'learn.whatYouGetMaster' as const,
  },
] as const;

/** Complete Crochet Collection / All-Access Crochet Pass (DatabaseSeeder.Catalog.BundleId). */
export const COMPLETE_COLLECTION_BUNDLE_ID = 'c0a1f001-0001-4000-8000-000000000004';

/** Bundle purchase enrolls the three included courses — not the bundle id itself. */
export function resolveCollectionOwnership(
  enrollments: Array<{
    courseId: string;
    isActive: boolean;
    isExpired: boolean;
    accessExpiryDate: string;
  }>,
): { owned: boolean; accessUntil: string | null } {
  const catalogIds = MAIN_COURSE_CATALOG.map((entry) => entry.id.toLowerCase());
  const activeByCourse = new Map<string, (typeof enrollments)[number]>();

  for (const enrollment of enrollments) {
    const id = enrollment.courseId.toLowerCase();
    if (!catalogIds.includes(id)) continue;
    if (!enrollment.isActive || enrollment.isExpired) continue;
    const existing = activeByCourse.get(id);
    if (
      !existing
      || new Date(enrollment.accessExpiryDate).getTime()
        > new Date(existing.accessExpiryDate).getTime()
    ) {
      activeByCourse.set(id, enrollment);
    }
  }

  if (activeByCourse.size < catalogIds.length) {
    return { owned: false, accessUntil: null };
  }

  let latest = 0;
  let latestIso: string | null = null;
  for (const enrollment of activeByCourse.values()) {
    const ts = new Date(enrollment.accessExpiryDate).getTime();
    if (ts >= latest) {
      latest = ts;
      latestIso = enrollment.accessExpiryDate;
    }
  }
  return { owned: true, accessUntil: latestIso };
}

export function isCompleteCollectionBundle(
  course: Pick<Course, 'id' | 'type' | 'name'> | null | undefined,
): boolean {
  if (!course) return false;
  // API normally sends the string enum; tolerate numeric Bundle = 2 if ever serialized that way.
  const type = course.type as string | number;
  if (type === 'Bundle' || type === 2) return true;
  if (sameId(course.id, COMPLETE_COLLECTION_BUNDLE_ID)) return true;
  const name = (course.name ?? '').trim();
  return /complete crochet collection|all-access crochet pass/i.test(name);
}

/** DatabaseSeeder.Catalog.ViralProjectsCategoryId */
export const VIRAL_PROJECTS_CATEGORY_ID = '22222222-2222-2222-2222-222222222222';

/** DatabaseSeeder.Catalog.TrendingTutorialsCategoryId */
export const TRENDING_TUTORIALS_CATEGORY_ID = '33333333-3333-3333-3333-333333333333';

export type DiscoverFilter = 'all' | 'trending' | 'viral' | 'product';

const DEMO_NAME_RE = /^(test(\s|$|\d)|demo\b|sample\b|internal\b)/i;

function sameId(a: string | null | undefined, b: string): boolean {
  return Boolean(a) && a!.toLowerCase() === b.toLowerCase();
}

export function courseMatchesCategory(course: Course, ...names: string[]): boolean {
  const current = (course.categoryName ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!current) return false;
  return names.some((name) => {
    const expected = name.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!expected) return false;
    if (current === expected) return true;
    if (expected.startsWith('trending') && current.startsWith('trending')) return true;
    if (expected.startsWith('viral') && current.startsWith('viral')) return true;
    return current.includes(expected) || expected.includes(current);
  });
}

/** Prefer stable category id; fall back to admin category name. */
export function isTrendingTutorial(course: Course): boolean {
  if (sameId(course.categoryId, TRENDING_TUTORIALS_CATEGORY_ID)) return true;
  return courseMatchesCategory(course, 'Trending Tutorials', 'Trending Tutorial');
}

/**
 * Viral placement is primarily the Viral projects category.
 * `ProjectCourse` type is kept as a legacy fallback when category was never set.
 */
export function isViralProject(course: Course): boolean {
  if (sameId(course.categoryId, VIRAL_PROJECTS_CATEGORY_ID)) return true;
  if (courseMatchesCategory(course, 'Viral projects', 'Viral project')) return true;
  return course.type === 'ProjectCourse';
}

/** Exclude obvious test/demo titles from customer-facing Learn surfaces. */
export function isCustomerFacingCourse(course: Course): boolean {
  if (course.status && course.status !== 'Published') return false;
  const name = course.name.trim();
  if (!name) return false;
  if (DEMO_NAME_RE.test(name)) return false;
  return true;
}

function matchesCatalogEntry(
  course: Course,
  entry: (typeof MAIN_COURSE_CATALOG)[number],
): boolean {
  if (course.id.toLowerCase() === entry.id.toLowerCase()) return true;
  const name = course.name.trim().toLowerCase();
  return name.includes(entry.nameHint);
}

/** Package line for What you get on Foundation / Signature / Master. */
export function getMainCourseWhatYouGetKey(
  course: Pick<Course, 'id' | 'name'>,
): (typeof MAIN_COURSE_CATALOG)[number]['whatYouGetKey'] | null {
  for (const entry of MAIN_COURSE_CATALOG) {
    if (matchesCatalogEntry(course as Course, entry)) return entry.whatYouGetKey;
  }
  return null;
}

/**
 * Returns the three main structured courses in fixed order.
 * Extra API courses (bundle, viral, tests, etc.) are excluded — not deleted.
 */
export function selectMainCourses(courses: Course[]): Course[] {
  const pool = courses.filter(
    (c) =>
      isCustomerFacingCourse(c) &&
      c.type === 'DigitalCourse' &&
      !isTrendingTutorial(c) &&
      !isViralProject(c),
  );

  const selected: Course[] = [];
  const used = new Set<string>();

  for (const entry of MAIN_COURSE_CATALOG) {
    const match = pool.find((c) => !used.has(c.id) && matchesCatalogEntry(c, entry));
    if (match) {
      selected.push(match);
      used.add(match.id);
    }
  }

  return selected;
}

function byDisplayOrder(a: Course, b: Course): number {
  const order = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  if (order !== 0) return order;
  return a.name.localeCompare(b.name);
}

/** Trending Tutorials category — secondary discovery. */
export function selectTrendingTutorials(
  courses: Course[],
  excludeIds: Set<string>,
): Course[] {
  return courses
    .filter(
      (c) =>
        isCustomerFacingCourse(c) &&
        !excludeIds.has(c.id) &&
        isTrendingTutorial(c),
    )
    .sort(byDisplayOrder);
}

/** Viral projects category — secondary discovery. */
export function selectViralProjects(
  courses: Course[],
  excludeIds: Set<string>,
): Course[] {
  return courses
    .filter(
      (c) =>
        isCustomerFacingCourse(c) &&
        !excludeIds.has(c.id) &&
        isViralProject(c),
    )
    .sort(byDisplayOrder);
}

/**
 * Courses linked from published Shop products.
 * Resolves product.linkedCourse ids against the courses list for full card data.
 */
export function selectProductLinkedCourses(
  courses: Course[],
  products: Product[],
  excludeIds: Set<string>,
): Course[] {
  const byId = new Map(courses.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const selected: Course[] = [];

  for (const product of products) {
    if (product.status && product.status !== 'Published') continue;
    const linkedId = product.linkedCourse?.id ?? product.courseId ?? null;
    if (!linkedId || seen.has(linkedId) || excludeIds.has(linkedId)) continue;
    const course = byId.get(linkedId);
    if (!course || !isCustomerFacingCourse(course)) continue;
    seen.add(linkedId);
    selected.push(course);
  }

  return selected;
}

/** Merge discovery pools for filter=all without duplicates (trending → viral → product). */
export function selectDiscoverCourses(
  courses: Course[],
  products: Product[],
  excludeIds: Set<string>,
  filter: DiscoverFilter,
): Course[] {
  const trending = selectTrendingTutorials(courses, excludeIds);
  const viral = selectViralProjects(courses, excludeIds);
  const productLinked = selectProductLinkedCourses(courses, products, excludeIds);

  if (filter === 'trending') return trending;
  if (filter === 'viral') return viral;
  if (filter === 'product') return productLinked;

  const seen = new Set<string>();
  const merged: Course[] = [];
  for (const course of [...trending, ...viral, ...productLinked]) {
    if (seen.has(course.id)) continue;
    seen.add(course.id);
    merged.push(course);
  }
  return merged;
}

export function courseMatchesQuery(course: Course, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [course.name, course.about, course.level, course.categoryName]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}
