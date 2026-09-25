import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { cancelAdminLiveBooking, getAdminLiveBooking } from '../api/live';
import { ApiClientError } from '../api/client';
import type { AdminLiveBookingDetail } from '../types';
import { formatDate, formatInr } from '../utils/format';
import { confirmDialog } from '../components/AppDialog';

function canCancel(status: string): boolean {
  // Confirmed bookings are final (studio rule). Only unpaid holds can be released.
  return status === 'PendingPayment';
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
    const ok = await confirmDialog(
      'Release this unpaid seat hold? Confirmed bookings cannot be cancelled.',
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
        <div className="form-error">
          {error}
        </div>
      )}

      <div className="card">
        <h2 className="card__title" style={{ marginBottom: 14 }}>Customer</h2>
        <dl className="detail-list">
          <dt>Name</dt>
          <dd>{booking.customerName || '—'}</dd>
          <dt>Phone</dt>
          <dd>{booking.customerPhone || '—'}</dd>
          <dt>Email</dt>
          <dd>{booking.customerEmail || '—'}</dd>
        </dl>
      </div>

      <div className="card">
        <h2 className="card__title" style={{ marginBottom: 14 }}>Booking</h2>
        <dl className="detail-list">
          <dt>Status</dt>
          <dd>{booking.status}</dd>
          <dt>Week</dt>
          <dd>
            W{booking.weekNumber} · {booking.seasonYear} ({booking.startDate} → {booking.endDate})
          </dd>
          <dt>Slot</dt>
          <dd>
            {booking.slotName} · {booking.seatsBooked}/{booking.seatCapacity} seats used (
            {booking.seatsRemaining} left)
          </dd>
          <dt>Break day</dt>
          <dd>{booking.breakWeekday || 'None'}</dd>
          <dt>Bookable</dt>
          <dd>{booking.isBookable ? 'Yes' : 'No'}</dd>
          <dt>Created</dt>
          <dd>{formatDate(booking.createdAt)}</dd>
          <dt>Confirmed</dt>
          <dd>{booking.confirmedAt ? formatDate(booking.confirmedAt) : '—'}</dd>
          <dt>Hold expires</dt>
          <dd>
            {booking.reservationExpiresAt ? formatDate(booking.reservationExpiresAt) : '—'}
          </dd>
        </dl>
      </div>

      <div className="card">
        <h2 className="card__title" style={{ marginBottom: 14 }}>Order</h2>
        <dl className="detail-list">
          <dt>Order</dt>
          <dd>
            <Link to={`/orders/${booking.orderId}`}>{booking.orderNumber || booking.orderId}</Link>
          </dd>
          <dt>Amount</dt>
          <dd>{formatInr(booking.totalAmount)}</dd>
          <dt>Payment</dt>
          <dd>{booking.paymentStatus ?? '—'}</dd>
        </dl>
      </div>

      {booking.days.length > 0 && (
        <div className="card">
          <h2 className="card__title" style={{ marginBottom: 14 }}>Week plan</h2>
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
