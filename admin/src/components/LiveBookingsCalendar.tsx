import { Link } from 'react-router-dom';
import type { AdminLiveBookingListItem, AdminLiveWeek, LiveBookingStatus } from '../types';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const MAX_VISIBLE_NAMES = 3;

type DayKind = 'Class' | 'Break' | 'Replacement' | 'NoReplacement' | 'Off';

type DayColumn = {
  date: Date;
  weekday: (typeof WEEKDAYS)[number];
  kind: DayKind;
  label: string;
  isToday: boolean;
};

type Props = {
  week: AdminLiveWeek | null;
  weeks: AdminLiveWeek[];
  weekIndex: number;
  bookings: AdminLiveBookingListItem[];
  statusFilter: LiveBookingStatus | '';
  loading: boolean;
  error: string | null;
  busySlot?: string | null;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  onBlockSlot?: (slotType: 'Morning' | 'Evening', isBlocked: boolean) => void;
  onModifyCapacity?: (slotType: 'Morning' | 'Evening', currentCapacity: number) => void;
};

function parseDateOnly(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatWeekRange(start: Date, end: Date): string {
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const left = start.toLocaleDateString('en-IN', { month: 'long', day: 'numeric' });
  const right = end.toLocaleDateString('en-IN', {
    month: sameMonth ? undefined : 'long',
    day: 'numeric',
    year: 'numeric',
  });
  return `${left} – ${right}`;
}

function formatDayNum(date: Date): string {
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }).toUpperCase();
}

function weekdayName(date: Date): (typeof WEEKDAYS)[number] {
  return WEEKDAYS[(date.getDay() + 6) % 7];
}

function buildDayColumns(week: AdminLiveWeek, today: Date): DayColumn[] {
  const start = parseDateOnly(week.startDate);
  const todayStart = startOfLocalDay(today);
  const breakName = week.breakWeekday?.trim() || null;

  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    const weekday = weekdayName(date);
    const isToday = startOfLocalDay(date).getTime() === todayStart.getTime();

    if (weekday === 'Sunday') {
      return { date, weekday, kind: 'Off', label: 'OFF', isToday };
    }
    if (weekday === 'Saturday') {
      if (breakName) {
        return { date, weekday, kind: 'Replacement', label: 'SATURDAY REPLACEMENT', isToday };
      }
      return { date, weekday, kind: 'NoReplacement', label: 'No replacement', isToday };
    }
    if (breakName && breakName.toLowerCase() === weekday.toLowerCase()) {
      return { date, weekday, kind: 'Break', label: 'NO CLASS', isToday };
    }
    return { date, weekday, kind: 'Class', label: 'CLASS', isToday };
  });
}

function slotMeta(week: AdminLiveWeek, slotType: 'Morning' | 'Evening') {
  const slot = week.slots.find((s) => s.slotType === slotType);
  const defaultHours =
    slotType === 'Morning' ? '10:00 AM – 12:00 PM' : '6:00 PM – 8:00 PM';
  return {
    hours: slot?.hours || defaultHours,
    seatCapacity: slot?.seatCapacity ?? 4,
    seatsBooked: slot?.seatsBooked ?? 0,
    isBlocked: Boolean(slot?.isBlocked || slot?.status === 'Blocked'),
  };
}

function holdsSeat(status: string): boolean {
  const key = status.toLowerCase();
  return key === 'confirmed' || key === 'pendingpayment';
}

function badgeClass(status: string): string {
  const key = status.toLowerCase();
  if (key === 'pendingpayment') return 'badge badge--pending';
  if (key === 'confirmed') return 'badge badge--published';
  if (key === 'cancelled' || key === 'expired') return 'badge badge--inactive';
  return `badge badge--${key}`;
}

function SlotCard({
  slotType,
  week,
  bookings,
  statusFilter,
  showActions,
  busy,
  onBlockSlot,
  onModifyCapacity,
}: {
  slotType: 'Morning' | 'Evening';
  week: AdminLiveWeek;
  bookings: AdminLiveBookingListItem[];
  statusFilter: LiveBookingStatus | '';
  showActions?: boolean;
  busy?: boolean;
  onBlockSlot?: (slotType: 'Morning' | 'Evening', isBlocked: boolean) => void;
  onModifyCapacity?: (slotType: 'Morning' | 'Evening', currentCapacity: number) => void;
}) {
  const meta = slotMeta(week, slotType);
  const slotBookings = bookings.filter((b) => b.slotType === slotType);
  const seatHolders = slotBookings.filter((b) => holdsSeat(String(b.status)));
  // Week.slots seatsBooked can lag / omit pending holds — never show below named seat-holders.
  const displayBooked = Math.max(meta.seatsBooked, seatHolders.length);
  const visible = slotBookings.slice(0, MAX_VISIBLE_NAMES);
  const hiddenCount = Math.max(0, slotBookings.length - visible.length);
  const capacity = meta.seatCapacity;
  const blocked = meta.isBlocked;
  const fullyBooked = !blocked && displayBooked >= capacity && capacity > 0;
  const fillPct =
    capacity > 0 ? Math.min(100, Math.round((displayBooked / capacity) * 100)) : 0;
  const shortLabel = slotType === 'Morning' ? 'Morning' : 'Evening';
  const icon = slotType === 'Morning' ? '☀' : '☾';

  let stateLabel: 'FULLY BOOKED' | 'AVAILABLE' | 'BOOKED' | 'FILTER' | 'BLOCKED' = 'AVAILABLE';
  if (blocked) stateLabel = 'BLOCKED';
  else if (fullyBooked) stateLabel = 'FULLY BOOKED';
  else if (displayBooked > 0 && (!statusFilter || statusFilter === 'Confirmed' || statusFilter === 'PendingPayment'))
    stateLabel = 'BOOKED';
  else if (statusFilter && statusFilter !== 'Confirmed') stateLabel = 'FILTER';
  else stateLabel = 'AVAILABLE';

  return (
    <div
      className={[
        'live-cal__slot',
        slotType === 'Morning' ? 'live-cal__slot--morning' : 'live-cal__slot--evening',
        fullyBooked ? 'live-cal__slot--full' : '',
        blocked ? 'live-cal__slot--blocked' : '',
        displayBooked > 0 ? 'live-cal__slot--has-bookings' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="live-cal__slot-top">
        <div className="live-cal__slot-label">
          <span className="live-cal__slot-icon" aria-hidden>
            {icon}
          </span>
          {shortLabel}
        </div>
        <div className="live-cal__slot-hours">{meta.hours}</div>
      </div>

      <div className="live-cal__names">
        {slotBookings.length === 0 ? (
          <p className="live-cal__empty-slot">{blocked ? 'Blocked for booking' : 'No bookings'}</p>
        ) : (
          <>
            {visible.map((booking) => {
              const fullName = booking.customerName?.trim() || 'VIVI Customer';
              return (
                <Link
                  key={booking.id}
                  to={`/live/bookings/${booking.id}`}
                  className="live-cal__name"
                  title={`${fullName} · ${booking.status}`}
                  data-tooltip={`${fullName} · ${booking.status}`}
                >
                  <span className="live-cal__name-text">{fullName}</span>
                  <span className={badgeClass(String(booking.status))}>{booking.status}</span>
                </Link>
              );
            })}
            {hiddenCount > 0 ? (
              <Link
                to={`/live/bookings/${slotBookings[MAX_VISIBLE_NAMES]?.id}`}
                className="live-cal__more"
              >
                +{hiddenCount} more
              </Link>
            ) : null}
          </>
        )}
      </div>

      <div className="live-cal__seat-row">
        <div className="live-cal__seat">
          <strong>
            {displayBooked}/{capacity}
          </strong>{' '}
          booked
        </div>
        <div
          className={`live-cal__meter${fullyBooked ? ' live-cal__meter--full' : ''}${blocked ? ' live-cal__meter--blocked' : ''}`}
          role="meter"
          aria-valuenow={displayBooked}
          aria-valuemin={0}
          aria-valuemax={capacity}
        >
          <span style={{ width: `${fillPct}%` }} />
        </div>
      </div>

      {stateLabel === 'BLOCKED' ? (
        <div className="live-cal__state live-cal__state--blocked">Blocked</div>
      ) : stateLabel === 'FULLY BOOKED' ? (
        <div className="live-cal__state live-cal__state--full">Fully booked</div>
      ) : stateLabel === 'FILTER' ? (
        <div className="live-cal__state">
          <span className={badgeClass(String(statusFilter))}>{statusFilter}</span>
        </div>
      ) : stateLabel === 'BOOKED' ? (
        <div className="live-cal__state live-cal__state--booked">Booked</div>
      ) : (
        <div className="live-cal__state">Available</div>
      )}

      {showActions && (onBlockSlot || onModifyCapacity) ? (
        <div className="live-cal__slot-actions">
          {onModifyCapacity ? (
            <button
              type="button"
              className="btn btn--ghost live-cal__slot-btn"
              disabled={busy}
              onClick={() => onModifyCapacity(slotType, capacity)}
            >
              Modify
            </button>
          ) : null}
          {onBlockSlot ? (
            <button
              type="button"
              className={`btn live-cal__slot-btn${blocked ? '' : ' btn--ghost'}`}
              disabled={busy}
              onClick={() => onBlockSlot(slotType, !blocked)}
            >
              {blocked ? 'Unblock' : 'Block'}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function LiveBookingsCalendar({
  week,
  weeks,
  weekIndex,
  bookings,
  statusFilter,
  loading,
  error,
  busySlot,
  onPreviousWeek,
  onNextWeek,
  onBlockSlot,
  onModifyCapacity,
}: Props) {
  if (loading && !week) {
    return (
      <div className="loading-state">
        <p>Loading calendar…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-state">
        <h3>Could not load calendar</h3>
        <p>{error}</p>
      </div>
    );
  }

  if (!week || weeks.length === 0) {
    return (
      <div className="empty-state">
        <h3>No live class weeks</h3>
        <p>The live season has not been set up yet. Refresh this page to try again.</p>
      </div>
    );
  }

  const start = parseDateOnly(week.startDate);
  const end = parseDateOnly(week.endDate);
  const days = buildDayColumns(week, new Date());
  const canPrev = weekIndex > 0;
  const canNext = weekIndex < weeks.length - 1;
  const weekHasBookings = bookings.length > 0;
  const morningBooked = Math.max(
    week.slots.find((s) => s.slotType === 'Morning')?.seatsBooked ?? 0,
    bookings.filter((b) => b.slotType === 'Morning' && holdsSeat(String(b.status))).length,
  );
  const eveningBooked = Math.max(
    week.slots.find((s) => s.slotType === 'Evening')?.seatsBooked ?? 0,
    bookings.filter((b) => b.slotType === 'Evening' && holdsSeat(String(b.status))).length,
  );
  const morningCap = week.slots.find((s) => s.slotType === 'Morning')?.seatCapacity ?? 4;
  const eveningCap = week.slots.find((s) => s.slotType === 'Evening')?.seatCapacity ?? 4;
  const firstActionDayKey = days.find((d) => d.kind === 'Class' || d.kind === 'Replacement')?.date.toISOString() ?? null;

  return (
    <div className="live-cal">
      <div className="live-cal__nav">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={onPreviousWeek}
          disabled={!canPrev || loading}
        >
          ← Previous week
        </button>
        <div className="live-cal__nav-center">
          <div className="live-cal__week-label">
            Week {week.weekNumber} · {week.seasonYear}
          </div>
          <div className="live-cal__week-range">{formatWeekRange(start, end)}</div>
          <div className="live-cal__week-stats">
            <span>
              Morning {morningBooked}/{morningCap}
            </span>
            <span className="live-cal__week-stats-dot" aria-hidden>
              ·
            </span>
            <span>
              Evening {eveningBooked}/{eveningCap}
            </span>
          </div>
        </div>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={onNextWeek}
          disabled={!canNext || loading}
        >
          Next week →
        </button>
      </div>

      {loading ? (
        <div className="loading-state">
          <p>Loading week bookings…</p>
        </div>
      ) : null}

      {!loading && !weekHasBookings ? (
        <div className="live-cal__week-empty">No live class bookings for this week.</div>
      ) : null}

      <div className="live-cal__scroll">
        <div className="live-cal__grid">
          {days.map((day) => (
            <div
              key={day.date.toISOString()}
              className={[
                'live-cal__day',
                day.isToday ? 'live-cal__day--today' : '',
                day.kind === 'Off' || day.kind === 'NoReplacement' || day.kind === 'Break'
                  ? 'live-cal__day--off'
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className="live-cal__day-head">
                <div className="live-cal__day-name">{day.weekday.slice(0, 3).toUpperCase()}</div>
                <div className="live-cal__day-date">{formatDayNum(day.date)}</div>
                {day.isToday ? <div className="live-cal__today">Today</div> : null}
              </div>

              {day.kind === 'Off' ? (
                <div className="live-cal__off">
                  <div className="live-cal__off-title">Sunday</div>
                  <div className="live-cal__off-body">Off</div>
                </div>
              ) : null}

              {day.kind === 'NoReplacement' ? (
                <div className="live-cal__off">
                  <div className="live-cal__off-title">Saturday</div>
                  <div className="live-cal__off-body">No replacement</div>
                </div>
              ) : null}

              {day.kind === 'Break' ? (
                <div className="live-cal__off">
                  <div className="live-cal__off-title">No class</div>
                  <div className="live-cal__off-body">Break day</div>
                </div>
              ) : null}

              {day.kind === 'Replacement' || day.kind === 'Class' ? (
                <div className="live-cal__day-body">
                  {day.kind === 'Replacement' ? (
                    <div className="live-cal__replacement-tag">Saturday replacement</div>
                  ) : null}
                  <SlotCard
                    slotType="Morning"
                    week={week}
                    bookings={bookings}
                    statusFilter={statusFilter}
                    showActions={day.date.toISOString() === firstActionDayKey}
                    busy={busySlot === 'Morning'}
                    onBlockSlot={onBlockSlot}
                    onModifyCapacity={onModifyCapacity}
                  />
                  <SlotCard
                    slotType="Evening"
                    week={week}
                    bookings={bookings}
                    statusFilter={statusFilter}
                    showActions={day.date.toISOString() === firstActionDayKey}
                    busy={busySlot === 'Evening'}
                    onBlockSlot={onBlockSlot}
                    onModifyCapacity={onModifyCapacity}
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function findWeekIndexForToday(weeks: AdminLiveWeek[], today = new Date()): number {
  if (weeks.length === 0) return -1;
  const t = startOfLocalDay(today).getTime();
  const idx = weeks.findIndex((w) => {
    const start = startOfLocalDay(parseDateOnly(w.startDate)).getTime();
    const end = startOfLocalDay(parseDateOnly(w.endDate)).getTime();
    return t >= start && t <= end;
  });
  if (idx >= 0) return idx;
  const upcoming = weeks.findIndex((w) => startOfLocalDay(parseDateOnly(w.startDate)).getTime() > t);
  if (upcoming >= 0) return upcoming;
  return weeks.length - 1;
}
