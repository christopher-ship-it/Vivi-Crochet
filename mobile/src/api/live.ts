import { apiRequest } from './client';

export type LiveSlotType = 'Morning' | 'Evening';

export interface LiveSlotAvailability {
  slotType: LiveSlotType | string;
  name: string;
  seatCapacity: number;
  seatsBooked: number;
  seatsRemaining: number;
  status: 'Available' | 'FullyBooked' | string;
}

export interface LiveDay {
  date: string;
  weekday: string;
  kind: 'Class' | 'Break' | 'Replacement' | 'Available' | 'Off' | string;
  label: string;
}

export interface LiveWeekSummary {
  id: string;
  weekNumber: number;
  seasonYear: number;
  startDate: string;
  endDate: string;
  isBookable: boolean;
  packagePrice: number;
  slots: LiveSlotAvailability[];
}

export interface LiveWeekDetail extends LiveWeekSummary {
  days: LiveDay[];
}

export interface CreateLiveBookingResponse {
  bookingId: string;
  orderId: string;
  orderNumber: string;
  razorpayOrderId: string;
  razorpayKeyId: string;
  amountPaise: number;
  currency: string;
  totalAmount: number;
  slotName: string;
  weekNumber: number;
  startDate: string;
  endDate: string;
}

export interface LiveBooking {
  id: string;
  orderId: string;
  orderNumber: string;
  status: string;
  slotType: string;
  slotName: string;
  weekNumber: number;
  startDate: string;
  endDate: string;
  packagePrice: number;
  days: LiveDay[];
  confirmedAt?: string | null;
}

export async function listLiveWeeks(): Promise<LiveWeekSummary[]> {
  return apiRequest<LiveWeekSummary[]>('/api/live/weeks', {}, false);
}

export async function getLiveWeek(weekId: string): Promise<LiveWeekDetail> {
  return apiRequest<LiveWeekDetail>(`/api/live/weeks/${weekId}`, {}, false);
}

export async function getLiveWeekAvailability(weekId: string): Promise<LiveWeekDetail> {
  return apiRequest<LiveWeekDetail>(`/api/live/weeks/${weekId}/availability`, {}, false);
}

export async function createLiveBooking(
  weekId: string,
  slotType: LiveSlotType,
): Promise<CreateLiveBookingResponse> {
  return apiRequest<CreateLiveBookingResponse>('/api/live/bookings', {
    method: 'POST',
    body: JSON.stringify({ weekId, slotType }),
  });
}

export async function getLiveBooking(bookingId: string): Promise<LiveBooking> {
  return apiRequest<LiveBooking>(`/api/live/bookings/${bookingId}`);
}

export async function listMyLiveBookings(): Promise<LiveBooking[]> {
  return apiRequest<LiveBooking[]>('/api/live/me/bookings');
}
