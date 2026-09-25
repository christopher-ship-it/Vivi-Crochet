import { Link } from 'react-router-dom';
import type { AdminLiveBookingListItem, AdminLiveWeek, LiveBookingStatus } from '../types';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const MAX_VISIBLE_NAMES = 4;

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
  // `{ day, year }` without a month renders as "2026 (day: 27)" in Chrome, so a
  // same-month range uses the bare day number on the left instead.
  const right = end.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  if (sameMonth) return `${start.getDate()} – ${right}`;
  const left = start.toLocaleDateString('en-IN', { month: 'long', day: 'numeric' });
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
  const shortLabel = slotType === 'Morning' ? 'Morning' : 'Evening';
  const icon = slotType === 'Morning' ? '☀' : '☾';

  let stateLabel: 'FULLY BOOKED' | 'AVAILABLE' | 'BOOKED' | 'FILTER' | 'BLOCKED' = 'AVAILABLE';
  if (blocked) stateLabel = 'BLOCKED';
  else if (fullyBooked) stateLabel = 'FULLY BOOKED';
  else if (displayBooked > 0 && (!statusFilter || statusFilter === 'Confirmed' || statusFilter === 'PendingPayment'))
    stateLabel = 'BOOKED';
  else if (statusFilter && statusFilter !== 'Confirmed') stateLabel = 'FILTER';
  else stateLabel = 'AVAILABLE';

  const stateText =
    stateLabel === 'BLOCKED'
      ? 'Blocked'
      : stateLabel === 'FULLY BOOKED'
        ? 'Full'
        : stateLabel === 'BOOKED'
          ? `${Math.max(0, capacity - displayBooked)} left`
          : stateLabel === 'FILTER'
            ? String(statusFilter)
            : 'Open';

  return (
    <div
      className={[
        'slot-card',
        slotType === 'Morning' ? 'slot-card--morning' : 'slot-card--evening',
        fullyBooked ? 'slot-card--full' : '',
        blocked ? 'slot-card--blocked' : '',
        displayBooked > 0 ? 'slot-card--booked' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="slot-card__head">
        <span className="slot-card__tag">
          <span className="slot-card__icon" aria-hidden>
            {icon}
          </span>
          {shortLabel}
        </span>
        <span className="slot-card__hours">{meta.hours}</span>
      </div>

      {slotBookings.length === 0 ? (
        <p className="slot-card__empty">{blocked ? 'Blocked for booking' : 'No bookings yet'}</p>
      ) : (
        <ul className="slot-card__people">
          {visible.map((booking) => {
            const fullName = booking.customerName?.trim() || 'VIVI Customer';
            const statusKey = String(booking.status).toLowerCase();
            return (
              <li key={booking.id}>
                <Link
                  to={`/live/bookings/${booking.id}`}
                  className="slot-card__person"
                  title={`${fullName} · ${booking.status}`}
                >
                  <span className="slot-card__avatar" aria-hidden>
                    {fullName.charAt(0).toUpperCase()}
                  </span>
                  <span className="slot-card__name">{fullName}</span>
                  <span
                    className={`slot-card__status slot-card__status--${statusKey}`}
                    aria-label={String(booking.status)}
                  />
                </Link>
              </li>
            );
          })}
          {hiddenCount > 0 ? (
            <li>
              <Link
                to={`/live/bookings/${slotBookings[MAX_VISIBLE_NAMES]?.id}`}
                className="slot-card__more"
              >
                +{hiddenCount} more
              </Link>
            </li>
          ) : null}
        </ul>
      )}

      <div className="slot-card__foot">
        <div className="slot-card__seats">
          <span className="slot-card__count">
            <strong>{displayBooked}</strong>/{capacity} seats
          </span>
          <span className={`slot-card__state slot-card__state--${stateLabel.toLowerCase().replace(' ', '-')}`}>
            {stateText}
          </span>
        </div>
        <div
          className="slot-card__meter"
          role="meter"
          aria-valuenow={displayBooked}
          aria-valuemin={0}
          aria-valuemax={capacity}
        >
          {Array.from({ length: Math.max(capacity, 0) }, (_, i) => (
            <span key={i} className={i < displayBooked ? 'is-filled' : undefined} />
          ))}
        </div>
      </div>

      {showActions && (onBlockSlot || onModifyCapacity) ? (
        <div className="slot-card__actions">
          {onModifyCapacity ? (
            <button
              type="button"
              className="slot-card__action"
              disabled={busy}
              onClick={() => onModifyCapacity(slotType, capacity)}
            >
              Modify
            </button>
          ) : null}
          {onBlockSlot ? (
            <button
              type="button"
              className={`slot-card__action${blocked ? ' slot-card__action--on' : ''}`}
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
          <div className="live-cal__legend" aria-hidden>
            <span><i className="slot-card__status slot-card__status--confirmed" />Confirmed</span>
            <span><i className="slot-card__status slot-card__status--pendingpayment" />Pending payment</span>
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
