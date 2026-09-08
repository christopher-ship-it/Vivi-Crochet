export function formatDuration(seconds?: number | null): string {
  if (seconds == null || seconds < 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatInr(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatAccessDays(days: number): string {
  if (days <= 0) return 'Access duration TBC';
  return `${days} day${days === 1 ? '' : 's'} access`;
}

export function formatCourseMeta(course: {
  videoCount: number;
  accessDays: number;
  level?: string | null;
  categoryName?: string | null;
}): string {
  const parts = [
    `${course.videoCount} lesson${course.videoCount === 1 ? '' : 's'}`,
    formatAccessDays(course.accessDays),
  ];
  if (course.level) parts.push(course.level);
  else if (course.categoryName) parts.push(course.categoryName);
  return parts.join(' · ');
}

export const COURSE_TYPE_LABELS: Record<string, string> = {
  DigitalCourse: 'Course',
  ProjectCourse: 'Viral project',
  Bundle: 'Bundle',
};

export const COURSE_ROW_COLORS = [
  { bg: '#e8215b', ink: '#ffffff', subInk: 'rgba(255,255,255,0.8)', priceInk: '#ffffff' },
  { bg: '#fff0f4', ink: '#221a1e', subInk: '#7a6d72', priceInk: '#e8215b' },
  { bg: '#ffe3ec', ink: '#221a1e', subInk: '#7a6d72', priceInk: '#c8145a' },
  { bg: '#ffffff', ink: '#221a1e', subInk: '#7a6d72', priceInk: '#e8215b' },
];
