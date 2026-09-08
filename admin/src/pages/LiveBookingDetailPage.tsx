import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { cancelAdminLiveBooking, getAdminLiveBooking } from '../api/live';
import { ApiClientError } from '../api/client';
import type { AdminLiveBookingDetail } from '../types';
import { formatDate, formatInr } from '../utils/format';

function canCancel(status: string): boolean {
  return status === 'PendingPayment' || status === 'Confirmed';
}

export function LiveBookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [booking, setBooking] = useState<AdminLiveBookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  async function load() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setBooking(await getAdminLiveBooking(id));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load booking.');
      setBooking(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  async function handleCancel() {
    if (!id || !booking) return;
    const ok = window.confirm(
      'Cancel this booking and free the seat? Paid refunds are not automatic — handle those separately if needed.',
    );
    if (!ok) return;

    setCancelling(true);
    setError(null);
    try {
      setBooking(await cancelAdminLiveBooking(id));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not cancel booking.');
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <div className="loading-state">
        <p>Loading booking…</p>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="error-state">
        <h3>Booking not found</h3>
        <p>{error}</p>
        <Link to="/live" className="btn">
          Back to bookings
        </Link>
      </div>
    );
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-header__title">
            Week {booking.weekNumber} · {booking.slotName}
          </h1>
          <p className="page-header__subtitle">
            {booking.customerName} · {booking.customerPhone} · {booking.status}
          </p>
        </div>
        <div className="page-header__actions">
          {canCancel(booking.status) && (
            <button
              type="button"
              className="btn"
              onClick={() => void handleCancel()}
              disabled={cancelling}
            >
              {cancelling ? 'Cancelling…' : 'Cancel booking'}
            </button>
          )}
          <Link to="/live" className="btn btn--ghost">
            Back
          </Link>
        </div>
      </header>

      {error && (
        <div className="form-error" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Customer</h2>
        <dl style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '12px 24px' }}>
          <dt style={{ fontWeight: 600, color: 'var(--vivi-muted)' }}>Name</dt>
          <dd>{booking.customerName || '—'}</dd>
          <dt style={{ fontWeight: 600, color: 'var(--vivi-muted)' }}>Phone</dt>
          <dd>{booking.customerPhone || '—'}</dd>
          <dt style={{ fontWeight: 600, color: 'var(--vivi-muted)' }}>Email</dt>
          <dd>{booking.customerEmail || '—'}</dd>
        </dl>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Booking</h2>
        <dl style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '12px 24px' }}>
          <dt style={{ fontWeight: 600, color: 'var(--vivi-muted)' }}>Status</dt>
          <dd>{booking.status}</dd>
          <dt style={{ fontWeight: 600, color: 'var(--vivi-muted)' }}>Week</dt>
          <dd>
            W{booking.weekNumber} · {booking.seasonYear} ({booking.startDate} → {booking.endDate})
          </dd>
          <dt style={{ fontWeight: 600, color: 'var(--vivi-muted)' }}>Slot</dt>
          <dd>
            {booking.slotName} · {booking.seatsBooked}/{booking.seatCapacity} seats used (
            {booking.seatsRemaining} left)
          </dd>
          <dt style={{ fontWeight: 600, color: 'var(--vivi-muted)' }}>Break day</dt>
          <dd>{booking.breakWeekday || 'None'}</dd>
          <dt style={{ fontWeight: 600, color: 'var(--vivi-muted)' }}>Bookable</dt>
          <dd>{booking.isBookable ? 'Yes' : 'No'}</dd>
          <dt style={{ fontWeight: 600, color: 'var(--vivi-muted)' }}>Created</dt>
          <dd>{formatDate(booking.createdAt)}</dd>
          <dt style={{ fontWeight: 600, color: 'var(--vivi-muted)' }}>Confirmed</dt>
          <dd>{booking.confirmedAt ? formatDate(booking.confirmedAt) : '—'}</dd>
          <dt style={{ fontWeight: 600, color: 'var(--vivi-muted)' }}>Hold expires</dt>
          <dd>
            {booking.reservationExpiresAt ? formatDate(booking.reservationExpiresAt) : '—'}
          </dd>
        </dl>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Order</h2>
        <dl style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '12px 24px' }}>
          <dt style={{ fontWeight: 600, color: 'var(--vivi-muted)' }}>Order</dt>
          <dd>
            <Link to={`/orders/${booking.orderId}`}>{booking.orderNumber || booking.orderId}</Link>
          </dd>
          <dt style={{ fontWeight: 600, color: 'var(--vivi-muted)' }}>Amount</dt>
          <dd>{formatInr(booking.totalAmount)}</dd>
          <dt style={{ fontWeight: 600, color: 'var(--vivi-muted)' }}>Payment</dt>
          <dd>{booking.paymentStatus ?? '—'}</dd>
        </dl>
      </div>

      {booking.days.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Week plan</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Day</th>
                <th>Date</th>
                <th>Kind</th>
                <th>Label</th>
              </tr>
            </thead>
            <tbody>
              {booking.days.map((day) => (
                <tr key={day.date}>
                  <td>{day.weekday}</td>
                  <td>{day.date}</td>
                  <td>{day.kind}</td>
                  <td>{day.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
