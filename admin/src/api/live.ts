import { apiRequest } from './client';
import type {
  AdminLiveBookingDetail,
  AdminLiveBookingListItem,
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
