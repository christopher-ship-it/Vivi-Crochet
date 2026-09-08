import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listAdminLiveBookings } from '../api/live';
import { ApiClientError } from '../api/client';
import { RowActionsMenu } from '../components/RowActionsMenu';
import type { AdminLiveBookingListItem, LiveBookingStatus } from '../types';
import { formatDate, formatInr } from '../utils/format';

const STATUS_OPTIONS: Array<LiveBookingStatus | ''> = [
  '',
  'PendingPayment',
  'Confirmed',
  'Cancelled',
  'Expired',
];

function badgeClass(status: string): string {
  const key = status.toLowerCase();
  if (key === 'pendingpayment') return 'badge badge--pending';
  if (key === 'confirmed') return 'badge badge--published';
  if (key === 'cancelled' || key === 'expired') return 'badge badge--inactive';
  return `badge badge--${key}`;
}

export function LiveBookingsPage() {
  const [bookings, setBookings] = useState<AdminLiveBookingListItem[]>([]);
  const [status, setStatus] = useState<LiveBookingStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await listAdminLiveBookings({ status });
        if (!cancelled) setBookings(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Failed to load bookings.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [status]);

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-header__title">Live classes</h1>
          <p className="page-header__subtitle">
            Track Morning and Evening Crochet Circle bookings from the app.
          </p>
        </div>
        <div className="page-header__actions">
          <Link to="/live/weeks" className="btn">
            Manage weeks
          </Link>
        </div>
      </header>

      <div className="toolbar" style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
        <label htmlFor="live-status-filter" style={{ fontWeight: 600 }}>
          Status
        </label>
        <select
          id="live-status-filter"
          value={status}
          onChange={(e) => setStatus(e.target.value as LiveBookingStatus | '')}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt || 'all'} value={opt}>
              {opt || 'All'}
            </option>
          ))}
        </select>
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

      {!loading && !error && bookings.length === 0 && (
        <div className="empty-state">
          <h3>No live bookings yet</h3>
          <p>Confirmed and pending seat holds from the mobile app will appear here.</p>
        </div>
      )}

      {!loading && !error && bookings.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Week</th>
                <th>Slot</th>
                <th>Customer</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Order</th>
                <th>Amount</th>
                <th>Payment</th>
                <th>Booked</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking) => (
                <tr key={booking.id}>
                  <td style={{ fontWeight: 600 }}>
                    W{booking.weekNumber} · {booking.seasonYear}
                  </td>
                  <td>{booking.slotName || booking.slotType}</td>
                  <td>{booking.customerName || '—'}</td>
                  <td>{booking.customerPhone || '—'}</td>
                  <td>
                    <span className={badgeClass(booking.status)}>{booking.status}</span>
                  </td>
                  <td>{booking.orderNumber || '—'}</td>
                  <td>{formatInr(booking.totalAmount)}</td>
                  <td>{booking.paymentStatus ?? '—'}</td>
                  <td>{formatDate(booking.createdAt)}</td>
                  <td>
                    <div className="data-table__actions">
                      <RowActionsMenu
                        label={`Actions for booking ${booking.orderNumber || booking.id}`}
                        items={[
                          {
                            id: 'view',
                            label: 'View booking',
                            to: `/live/bookings/${booking.id}`,
                          },
                        ]}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
