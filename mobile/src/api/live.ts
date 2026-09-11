import { apiRequest } from './client';

export type LiveSlotType = 'Morning' | 'Evening';

export interface LiveSlotAvailability {
  slotType: LiveSlotType | string;
  name: string;
  hours?: string;
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
  weeklyLiveHours?: number;
  hoursPerClassDay?: number;
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
  slotHours?: string;
  weekNumber: number;
  startDate: string;
  endDate: string;
  packagePrice: number;
  weeklyLiveHours?: number;
  days: LiveDay[];
  confirmedAt?: string | null;
}

function toLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Monday that starts the current Live week (local device calendar). */
function currentWeekMonday(from = new Date()): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const day = d.getDay(); // 0 = Sun
  const offset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offset);
  return d;
}

/** Customer UI: only this week + next week (defends against older APIs returning the full season). */
export function filterCurrentAndNextLiveWeeks(weeks: LiveWeekSummary[]): LiveWeekSummary[] {
  const monday = currentWeekMonday();
  const next = new Date(monday);
  next.setDate(next.getDate() + 7);
  const allowed = new Set([toLocalIsoDate(monday), toLocalIsoDate(next)]);
  return weeks
    .filter((w) => allowed.has(String(w.startDate).slice(0, 10)))
    .sort((a, b) => a.weekNumber - b.weekNumber || a.startDate.localeCompare(b.startDate));
}

export async function listLiveWeeks(): Promise<LiveWeekSummary[]> {
  const weeks = await apiRequest<LiveWeekSummary[]>('/api/live/weeks', {}, false);
  return filterCurrentAndNextLiveWeeks(weeks);
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
