import { apiRequest } from './client';
import type {
  AdminLiveBookingDetail,
  AdminLiveBookingListItem,
  AdminLiveCourse,
  AdminLiveEnquiry,
  AdminLiveSettings,
  AdminLiveTutorDefault,
  AdminLiveWeek,
  LiveBookingStatus,
  LiveSlotType,
} from '../types';

export type ListLiveBookingsParams = {
  status?: LiveBookingStatus | '';
  weekNumber?: number | '';
  seasonYear?: number | '';
  slotType?: LiveSlotType | '';
};

export async function listAdminLiveBookings(
  params: ListLiveBookingsParams = {},
): Promise<AdminLiveBookingListItem[]> {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.weekNumber !== undefined && params.weekNumber !== '') {
    query.set('weekNumber', String(params.weekNumber));
  }
  if (params.seasonYear !== undefined && params.seasonYear !== '') {
    query.set('seasonYear', String(params.seasonYear));
  }
  if (params.slotType) query.set('slotType', params.slotType);
  const qs = query.toString();
  return apiRequest<AdminLiveBookingListItem[]>(
    `/api/admin/live/bookings${qs ? `?${qs}` : ''}`,
  );
}

export async function getAdminLiveBooking(id: string): Promise<AdminLiveBookingDetail> {
  return apiRequest<AdminLiveBookingDetail>(`/api/admin/live/bookings/${id}`);
}

export async function cancelAdminLiveBooking(id: string): Promise<AdminLiveBookingDetail> {
  return apiRequest<AdminLiveBookingDetail>(`/api/admin/live/bookings/${id}/cancel`, {
    method: 'POST',
  });
}

export async function deleteAdminLiveBooking(id: string): Promise<void> {
  await apiRequest<void>(`/api/admin/live/bookings/${id}`, { method: 'DELETE' });
}

export async function listAdminLiveWeeks(): Promise<AdminLiveWeek[]> {
  return apiRequest<AdminLiveWeek[]>('/api/admin/live/weeks');
}

export async function ensureLiveSeason(): Promise<void> {
  await apiRequest<void>('/api/admin/live/ensure-season', { method: 'POST' });
}

export async function setLiveSlotCapacity(
  weekId: string,
  slotType: LiveSlotType | string,
  seatCapacity: number,
): Promise<void> {
  await apiRequest<void>(`/api/admin/live/weeks/${weekId}/slots/${slotType}/capacity`, {
    method: 'PUT',
    body: JSON.stringify({ seatCapacity }),
  });
}

export async function setLiveSlotBlocked(
  weekId: string,
  slotType: LiveSlotType | string,
  isBlocked: boolean,
): Promise<void> {
  await apiRequest<void>(`/api/admin/live/weeks/${weekId}/slots/${slotType}/blocked`, {
    method: 'PUT',
    body: JSON.stringify({ isBlocked }),
  });
}

export async function getLiveSettings(): Promise<AdminLiveSettings> {
  return apiRequest<AdminLiveSettings>('/api/admin/live/settings');
}

export async function updateLiveSettings(settings: AdminLiveSettings): Promise<AdminLiveSettings> {
  return apiRequest<AdminLiveSettings>('/api/admin/live/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

export interface CreateAdminLiveEnquiry {
  name: string;
  email: string;
  phone: string;
  courseId: string;
  weekId: string;
  slotType: LiveSlotType;
  /** Typed by the admin for this student; never filled in from a default. */
  classTime: string;
  paymentReference: string;
}

export async function listAdminLiveEnquiries(): Promise<AdminLiveEnquiry[]> {
  return apiRequest<AdminLiveEnquiry[]>('/api/admin/live/enquiries');
}

/** Records the enquiry and emails the class plan to the student. */
export async function createAdminLiveEnquiry(body: CreateAdminLiveEnquiry): Promise<AdminLiveEnquiry> {
  return apiRequest<AdminLiveEnquiry>('/api/admin/live/enquiries', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function sendAdminLiveEnquiry(id: string): Promise<AdminLiveEnquiry> {
  return apiRequest<AdminLiveEnquiry>(`/api/admin/live/enquiries/${id}/send`, { method: 'POST' });
}

export async function listAdminLiveCourses(): Promise<AdminLiveCourse[]> {
  return apiRequest<AdminLiveCourse[]>('/api/admin/live/courses');
}

export async function updateAdminLiveCourse(course: AdminLiveCourse): Promise<AdminLiveCourse> {
  return apiRequest<AdminLiveCourse>(`/api/admin/live/courses/${course.id}`, {
    method: 'PUT',
    body: JSON.stringify(course),
  });
}

/** Null clears an override so the week uses the studio-wide value again. */
export async function setLiveWeekOverrides(
  weekId: string,
  overrides: {
    priceOverride: number | null;
    languageOverride: string | null;
    levelOverride: string | null;
  },
): Promise<void> {
  await apiRequest<void>(`/api/admin/live/weeks/${weekId}/overrides`, {
    method: 'PUT',
    body: JSON.stringify(overrides),
  });
}

/** Null or empty clears the override so the session uses its default hours. */
export async function setLiveSlotHours(
  weekId: string,
  slotType: LiveSlotType | string,
  hours: string | null,
): Promise<void> {
  await apiRequest<void>(`/api/admin/live/weeks/${weekId}/slots/${slotType}/hours`, {
    method: 'PUT',
    body: JSON.stringify({ hours }),
  });
}

export interface LiveTutorPhotoUploadUrlRequest {
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
}

export interface LiveTutorPhotoUploadUrlResponse {
  uploadUrl: string;
  expiresAt: string;
  blobPath: string;
  maxFileSizeBytes: number;
}

export interface LiveTutorPhotoUploadCompleteRequest {
  blobPath: string;
  fileSizeBytes: number;
  contentType: string;
}

export async function requestLiveTutorPhotoUploadUrl(
  weekId: string,
  data: LiveTutorPhotoUploadUrlRequest,
): Promise<LiveTutorPhotoUploadUrlResponse> {
  return apiRequest<LiveTutorPhotoUploadUrlResponse>(
    `/api/admin/live/weeks/${weekId}/tutor-photo-upload-url`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  );
}

export async function completeLiveTutorPhotoUpload(
  weekId: string,
  data: LiveTutorPhotoUploadCompleteRequest,
): Promise<AdminLiveWeek> {
  return apiRequest<AdminLiveWeek>(`/api/admin/live/weeks/${weekId}/tutor-photo-upload-complete`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteLiveTutorPhoto(weekId: string): Promise<AdminLiveWeek> {
  return apiRequest<AdminLiveWeek>(`/api/admin/live/weeks/${weekId}/tutor-photo`, {
    method: 'DELETE',
  });
}

export async function setLiveWeekTutor(
  weekId: string,
  tutorName: string,
): Promise<AdminLiveWeek> {
  return apiRequest<AdminLiveWeek>(`/api/admin/live/weeks/${weekId}/tutor`, {
    method: 'PUT',
    body: JSON.stringify({ tutorName }),
  });
}

export async function clearLiveWeekTutorOverride(weekId: string): Promise<AdminLiveWeek> {
  return apiRequest<AdminLiveWeek>(`/api/admin/live/weeks/${weekId}/tutor-override`, {
    method: 'DELETE',
  });
}

export async function getLiveTutorDefault(): Promise<AdminLiveTutorDefault> {
  return apiRequest<AdminLiveTutorDefault>('/api/admin/live/tutor-default');
}

export async function requestLiveTutorDefaultPhotoUploadUrl(
  data: LiveTutorPhotoUploadUrlRequest,
): Promise<LiveTutorPhotoUploadUrlResponse> {
  return apiRequest<LiveTutorPhotoUploadUrlResponse>(
    '/api/admin/live/tutor-default/photo-upload-url',
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  );
}

export async function completeLiveTutorDefaultPhotoUpload(
  data: LiveTutorPhotoUploadCompleteRequest,
): Promise<AdminLiveTutorDefault> {
  return apiRequest<AdminLiveTutorDefault>('/api/admin/live/tutor-default/photo-upload-complete', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteLiveTutorDefaultPhoto(): Promise<AdminLiveTutorDefault> {
  return apiRequest<AdminLiveTutorDefault>('/api/admin/live/tutor-default/photo', {
    method: 'DELETE',
  });
}

export async function setLiveTutorDefaultName(tutorName: string): Promise<AdminLiveTutorDefault> {
  return apiRequest<AdminLiveTutorDefault>('/api/admin/live/tutor-default/name', {
    method: 'PUT',
    body: JSON.stringify({ tutorName }),
  });
}
