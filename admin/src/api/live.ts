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

export async function setLiveWeekBreak(
  weekId: string,
  breakWeekday: string | null,
): Promise<void> {
  await apiRequest<void>(`/api/admin/live/weeks/${weekId}/break`, {
    method: 'PUT',
    body: JSON.stringify({ breakWeekday }),
  });
}

export async function setLiveWeekBookable(weekId: string, isBookable: boolean): Promise<void> {
  await apiRequest<void>(`/api/admin/live/weeks/${weekId}/bookable`, {
    method: 'PUT',
    body: JSON.stringify({ isBookable }),
  });
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
