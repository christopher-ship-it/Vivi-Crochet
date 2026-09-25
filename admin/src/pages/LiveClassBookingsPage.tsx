import { useEffect, useMemo, useState } from 'react';
import { listAdminLiveBookings, listAdminLiveWeeks } from '../api/live';
import { ApiClientError } from '../api/client';
import { RowActionsMenu } from '../components/RowActionsMenu';
import type { AdminLiveBookingListItem, LiveBookingStatus, LiveSlotType } from '../types';
import { formatInr } from '../utils/format';

const STATUS_OPTIONS: Array<LiveBookingStatus | ''> = [
  '',
  'PendingPayment',
  'Confirmed',
  'Cancelled',
  'Expired',
];

const SLOT_OPTIONS: Array<LiveSlotType | ''> = ['', 'Morning', 'Evening'];

function displayOrDash(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : '—';
}

function badgeClass(status: string): string {
  const key = status.toLowerCase();
  if (key === 'pendingpayment') return 'badge badge--pending';
  if (key === 'confirmed') return 'badge badge--published';
  if (key === 'cancelled' || key === 'expired') return 'badge badge--inactive';
  return `badge badge--${key}`;
}

/** Admin TITLE column only — maps slot type to Morning Class / Evening Class. */
function liveClassTitle(slotType: string): string {
  const key = slotType.trim().toLowerCase();
  if (key === 'morning') return 'Morning Class';
  if (key === 'evening') return 'Evening Class';
  return displayOrDash(slotType);
}

function formatWeekRange(startDate: string, endDate: string, weekNumber: number, seasonYear: number): string {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (start && end) {
    const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
    // `{ day, year }` without a month renders as "2026 (day: 11)" in Chrome.
    const endLabel = end.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const startLabel = sameMonth
      ? String(start.getDate())
      : start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    return `${startLabel} – ${endLabel}`;
  }
  return `W${weekNumber} · ${seasonYear}`;
}

function parseDateOnly(value: string): Date | null {
  if (!value) return null;
  // DateOnly serializes as YYYY-MM-DD
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatClassDate(startDate: string, endDate: string): string {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (!start || !end) return '—';
  const startLabel = start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const endLabel = end.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${startLabel} – ${endLabel}`;
}

function matchesSearch(booking: AdminLiveBookingListItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    booking.customerName,
    booking.customerEmail,
    booking.customerPhone,
    booking.orderNumber,
    booking.id,
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

export function LiveClassBookingsPage() {
  const [bookings, setBookings] = useState<AdminLiveBookingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<LiveBookingStatus | ''>('');
  const [slotType, setSlotType] = useState<LiveSlotType | ''>('');
  const [weekKey, setWeekKey] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [search, setSearch] = useState('');
  const [weekOptions, setWeekOptions] = useState<Array<{ key: string; label: string; weekNumber: number; seasonYear: number }>>([]);

  useEffect(() => {
    let cancelled = false;
    async function loadWeeks() {
      try {
        const weeks = await listAdminLiveWeeks();
        if (cancelled) return;
        const options = [...weeks]
          .sort((a, b) => a.startDate.localeCompare(b.startDate))
          .map((w) => ({
            key: `${w.seasonYear}-${w.weekNumber}`,
            label: formatWeekRange(w.startDate, w.endDate, w.weekNumber, w.seasonYear),
            weekNumber: w.weekNumber,
            seasonYear: w.seasonYear,
          }));
        setWeekOptions(options);
      } catch {
        // Week filter is optional if weeks fail to load.
      }
    }
    void loadWeeks();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const selectedWeek = weekOptions.find((w) => w.key === weekKey);
        const data = await listAdminLiveBookings({
          status,
          slotType,
          weekNumber: selectedWeek?.weekNumber ?? '',
          seasonYear: selectedWeek?.seasonYear ?? '',
        });
        if (!cancelled) setBookings(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Failed to load live class bookings.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
    // weekOptions used only to resolve weekKey → numbers; reload when filters change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, slotType, weekKey]);

  const visible = useMemo(() => {
    return bookings.filter((booking) => {
      if (paymentFilter && (booking.paymentStatus ?? '') !== paymentFilter) return false;
      return matchesSearch(booking, search);
    });
  }, [bookings, paymentFilter, search]);

  const paymentOptions = useMemo(() => {
    const set = new Set<string>();
    for (const b of bookings) {
      if (b.paymentStatus) set.add(b.paymentStatus);
    }
    return Array.from(set).sort();
  }, [bookings]);

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-header__title">Live Class Bookings</h1>
          <p className="page-header__subtitle">
            Customers who booked a weekly Morning or Evening class. Manage capacity and weeks under Live
            classes.
          </p>
        </div>
      </header>

      <div className="filter-bar">
        <div className="form-field filter-bar__search">
          <label htmlFor="live-bookings-search">Search</label>
          <input
            id="live-bookings-search"
            type="search"
            placeholder="Name, email, phone, booking…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="form-field">
          <label htmlFor="live-bookings-week">Week</label>
          <select id="live-bookings-week" value={weekKey} onChange={(e) => setWeekKey(e.target.value)}>
            <option value="">All weeks</option>
            {weekOptions.map((w) => (
              <option key={w.key} value={w.key}>
                {w.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="live-bookings-class">Class</label>
          <select
            id="live-bookings-class"
            value={slotType}
            onChange={(e) => setSlotType(e.target.value as LiveSlotType | '')}
          >
            <option value="">All classes</option>
            {SLOT_OPTIONS.filter(Boolean).map((slot) => (
              <option key={slot} value={slot}>
                {liveClassTitle(slot)}
              </option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="live-bookings-payment">Payment</label>
          <select
            id="live-bookings-payment"
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
          >
            <option value="">All payments</option>
            {paymentOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="live-bookings-status">Status</label>
          <select
            id="live-bookings-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as LiveBookingStatus | '')}
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.filter(Boolean).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && (
        <div className="loading-state">
          <p>Loading bookings…</p>
        </div>
      )}

      {error && (
        <div className="error-state">
          <h3>Could not load bookings</h3>
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && visible.length === 0 && (
        <div className="empty-state">
          <h3>No live class bookings</h3>
          <p>Confirmed and pending Morning / Evening week packages will appear here.</p>
        </div>
      )}

      {!loading && !error && visible.length > 0 && (
        <div className="table-wrap">
          <table className="data-table data-table--live-bookings">
            <thead>
              <tr>
                <th className="col-booking">Booking</th>
                <th className="col-customer">Customer</th>
                <th className="col-email">Email</th>
                <th className="col-phone">Phone</th>
                <th className="col-title">Class</th>
                <th className="col-week">Week</th>
                <th className="col-date">Date</th>
                <th className="col-amount">Amount</th>
                <th className="col-payment">Payment</th>
                <th className="col-status">Status</th>
                <th className="col-actions" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {visible.map((booking) => {
                const title = liveClassTitle(booking.slotType);
                const week = formatWeekRange(
                  booking.startDate,
                  booking.endDate,
                  booking.weekNumber,
                  booking.seasonYear,
                );
                return (
                  <tr key={booking.id}>
                    <td className="col-booking cell-strong" title={booking.orderNumber || undefined}>
                      {displayOrDash(booking.orderNumber)}
                    </td>
                    <td className="col-customer col-clip" title={booking.customerName || undefined}>
                      {displayOrDash(booking.customerName)}
                    </td>
                    <td className="col-email col-clip" title={booking.customerEmail || undefined}>
                      {displayOrDash(booking.customerEmail)}
                    </td>
                    <td className="col-phone">{displayOrDash(booking.customerPhone)}</td>
                    <td className="col-title">{title}</td>
                    <td className="col-week">{week}</td>
                    <td className="col-date">{formatClassDate(booking.startDate, booking.endDate)}</td>
                    <td className="col-amount">{formatInr(booking.totalAmount)}</td>
                    <td className="col-payment">{booking.paymentStatus ?? '—'}</td>
                    <td className="col-status">
                      <span className={badgeClass(String(booking.status))}>{booking.status}</span>
                    </td>
                    <td className="col-actions">
                      <div className="data-table__actions">
                        <RowActionsMenu
                          label={`Actions for booking ${booking.orderNumber || booking.id}`}
                          items={[
                            {
                              id: 'view',
                              label: 'View booking',
                              to: `/live/bookings/${booking.id}`,
                            },
                            {
                              id: 'order',
                              label: 'View order',
                              to: `/orders/${booking.orderId}`,
                              disabled: !booking.orderId,
                            },
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
