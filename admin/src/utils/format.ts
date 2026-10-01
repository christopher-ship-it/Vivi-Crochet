export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_EXTENSIONS = ['.mp4', '.mov', '.webm'];
const ALLOWED_MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
};

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  contentType?: string;
}

export function validateVideoFile(file: File): FileValidationResult {
  const ext = file.name.includes('.') ? `.${file.name.split('.').pop()!.toLowerCase()}` : '';
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return { valid: false, error: 'Only MP4, MOV, and WebM files are allowed.' };
  }
  if (file.size <= 0) {
    return { valid: false, error: 'File is empty.' };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { valid: false, error: 'File exceeds the 10 GB limit.' };
  }
  const contentType = ALLOWED_MIME[ext] ?? (file.type || 'video/mp4');
  return { valid: true, contentType };
}

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const IMAGE_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export function validateImageFile(file: File, maxBytes: number = MAX_IMAGE_BYTES): FileValidationResult {
  const ext = file.name.includes('.') ? `.${file.name.split('.').pop()!.toLowerCase()}` : '';
  if (!IMAGE_EXTENSIONS.includes(ext)) {
    return { valid: false, error: 'Only JPG, PNG, and WebP images are allowed.' };
  }
  if (file.size <= 0) {
    return { valid: false, error: 'File is empty.' };
  }
  if (file.size > maxBytes) {
    return { valid: false, error: `Image exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB limit.` };
  }
  const contentType = IMAGE_MIME[ext] ?? (file.type || 'image/jpeg');
  return { valid: true, contentType };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDuration(seconds?: number | null): string {
  if (seconds == null || seconds < 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function parseDuration(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(':');
  if (parts.length === 2) {
    const m = parseInt(parts[0], 10);
    const s = parseInt(parts[1], 10);
    if (!Number.isNaN(m) && !Number.isNaN(s)) return m * 60 + s;
  }
  const asNum = parseInt(trimmed, 10);
  return Number.isNaN(asNum) ? null : asNum;
}

/** Reads duration from a local video File via the browser media element. */
export function readVideoFileDurationSeconds(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement('video');
    el.preload = 'metadata';
    el.muted = true;
    el.playsInline = true;

    const finish = (seconds: number | null) => {
      URL.revokeObjectURL(url);
      el.removeAttribute('src');
      el.load();
      resolve(seconds);
    };

    el.onloadedmetadata = () => {
      const seconds = Number.isFinite(el.duration) && el.duration > 0
        ? Math.round(el.duration)
        : null;
      finish(seconds);
    };
    el.onerror = () => finish(null);
    el.src = url;
  });
}

/** Reads duration from a remote/playable video URL. */
export function readVideoUrlDurationSeconds(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const el = document.createElement('video');
    el.preload = 'metadata';
    el.muted = true;
    el.playsInline = true;
    el.crossOrigin = 'anonymous';

    const finish = (seconds: number | null) => {
      el.removeAttribute('src');
      el.load();
      resolve(seconds);
    };

    el.onloadedmetadata = () => {
      const seconds = Number.isFinite(el.duration) && el.duration > 0
        ? Math.round(el.duration)
        : null;
      finish(seconds);
    };
    el.onerror = () => finish(null);
    el.src = url;
  });
}

export function formatInr(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Formats an amount in its own currency: whole rupees for INR, dollars and cents for USD. */
export function formatMoney(amount: number, currency: string | null | undefined): string {
  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  }
  return formatInr(amount);
}

/**
 * The API stores UTC but often sends timestamps without a "Z" (e.g. 2026-09-30T08:00:00).
 * Browsers read those as local time, which shifts every time by the UTC offset.
 * Treat a timestamp with a time part but no zone as UTC, so it shows in the viewer's local time.
 */
export function parseApiDate(value: string | number | Date): Date {
  if (typeof value !== 'string') return new Date(value);
  const hasTime = /T\d{2}:\d{2}/.test(value);
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(value);
  return new Date(hasTime && !hasZone ? `${value}Z` : value);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parseApiDate(iso));
}

export function formatDay(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parseApiDate(iso));
}

export const COURSE_TYPE_LABELS: Record<string, string> = {
  DigitalCourse: 'Course',
  ProjectCourse: 'Viral project',
  Bundle: 'Bundle',
};

export const LANGUAGE_OPTIONS = [
  'Tamil',
  'English',
  'Hindi',
  'Malayalam',
  'Telugu',
  'Kannada',
];
