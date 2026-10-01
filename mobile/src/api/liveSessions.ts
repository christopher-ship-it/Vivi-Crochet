/**
 * Pure helpers for Live sessions. Kept free of imports so they can be unit tested with
 * `node --test` (live.ts pulls in React Native code).
 */

/** Start of a session in minutes after midnight ("1:00 PM – 3:00 PM" → 780), or null if unreadable. */
export function sessionStartMinutes(hours?: string | null): number | null {
  const match = (hours ?? '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = (match[3] ?? '').toUpperCase();
  if (meridiem === 'PM' && hour < 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;
  return hour * 60 + minute;
}

/**
 * Sessions in the order they happen in the day (Morning, Mid-day, Evening…), so an additional
 * session an admin adds lands where it belongs. Sessions with unreadable timing keep their order
 * after the readable ones.
 */
export function sortSlotsByTime<T extends { hours?: string | null }>(slots: readonly T[]): T[] {
  return slots
    .map((slot, index) => ({ slot, index, start: sessionStartMinutes(slot.hours) }))
    .sort((a, b) => {
      if (a.start === null && b.start === null) return a.index - b.index;
      if (a.start === null) return 1;
      if (b.start === null) return -1;
      return a.start - b.start || a.index - b.index;
    })
    .map((entry) => entry.slot);
}
