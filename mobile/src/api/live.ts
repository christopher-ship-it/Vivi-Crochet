import { apiRequest } from './client';

/** Morning and Evening are always offered; Extra1–Extra3 are additional sessions admin can switch on. */
export type LiveSlotType = 'Morning' | 'Evening' | 'Extra1' | 'Extra2' | 'Extra3';

export interface LiveSlotAvailability {
  slotType: LiveSlotType | string;
  name: string;
  hours?: string;
  seatCapacity: number;
  seatsBooked: number;
  seatsRemaining: number;
  status: 'Available' | 'FullyBooked' | 'Blocked' | string;
  isBlocked?: boolean;
}

export { sessionStartMinutes, sortSlotsByTime } from './liveSessions';

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
  /** Price for this week, set in the admin (a week can have its own price). */
  packagePrice: number;
  /** Class language and level for this week, set in the admin. */
  language?: string;
  level?: string;
  tutorName?: string | null;
  tutorPhotoUrl?: string | null;
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
  paymentProvider?: 'Razorpay' | string;
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

/** Wall-clock "now" in India Standard Time. */
export function indiaNow(from = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(from);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return new Date(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
}

/**
 * Mon–Fri class range label, e.g. "21–25 Sept".
 * Uses week StartDate (Monday); Friday = Monday + 4.
 */
export function formatLiveClassWeekRange(startDate: string): string {
  const raw = String(startDate).slice(0, 10);
  const [y, m, d] = raw.split('-').map(Number);
  if (!y || !m || !d) return raw;
  const start = new Date(y, m - 1, d);
  const end = new Date(y, m - 1, d + 4);
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sept',
    'Oct',
    'Nov',
    'Dec',
  ];
  const sameMonth = start.getMonth() === end.getMonth();
  if (sameMonth) {
    return `${start.getDate()}–${end.getDate()} ${months[start.getMonth()]}`;
  }
  return `${start.getDate()} ${months[start.getMonth()]} – ${end.getDate()} ${months[end.getMonth()]}`;
}

/**
 * The server decides which weeks are open for booking (it knows the Morning session's start
 * time, which admin can change), so the app shows exactly what it returns.
 */
export async function listLiveWeeks(): Promise<LiveWeekSummary[]> {
  const weeks = await apiRequest<LiveWeekSummary[]>('/api/live/weeks', {}, false);
  return [...weeks].sort(
    (a, b) => a.startDate.localeCompare(b.startDate) || a.weekNumber - b.weekNumber,
  );
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

/** True while the booked week’s Sunday (endDate) has not passed in India. */
export function isLiveBookingCurrent(
  booking: Pick<LiveBooking, 'endDate'>,
  from = new Date(),
): boolean {
  const end = String(booking.endDate ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return false;
  return end >= toLocalIsoDate(indiaNow(from));
}

export async function listMyLiveBookings(): Promise<LiveBooking[]> {
  const bookings = await apiRequest<LiveBooking[]>('/api/live/me/bookings');
  return bookings
    .filter((b) => isLiveBookingCurrent(b))
    .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
}
