import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getAdminOrder, updateOrderDeliveryDate, updateOrderStatus } from '../api/orders';
import { ApiClientError } from '../api/client';
import type { AdminOrderDetail, OrderStatus } from '../types';
import { formatDate, formatDay, formatInr } from '../utils/format';

function toDateInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const STATUS_LABELS: Record<string, string> = {
  PendingPayment: 'Pending payment',
  Paid: 'Paid',
  Confirmed: 'Confirmed',
  InProduction: 'In production',
  Shipped: 'Dispatched',
  Delivered: 'Delivered',
  Cancelled: 'Cancelled',
  PaymentFailed: 'Payment failed',
};

function nextStatuses(current: OrderStatus): OrderStatus[] {
  switch (current) {
    case 'Confirmed':
      return ['InProduction', 'Shipped'];
    case 'InProduction':
      return ['Shipped', 'Delivered'];
    case 'Shipped':
      return ['Delivered'];
    default:
      return [];
  }
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [nextStatus, setNextStatus] = useState<OrderStatus | ''>('');

  async function load() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminOrder(id);
      setOrder(data);
      resetDeliveryForm(data);
      const options = nextStatuses(data.status);
      setNextStatus(options[0] ?? '');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load order.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  function resetDeliveryForm(source: AdminOrderDetail | null) {
    if (source?.delivery) {
      setFrom(toDateInput(source.delivery.expectedFrom));
      setTo(toDateInput(source.delivery.expectedTo));
      setReason(source.overrideReason ?? '');
    } else {
      setFrom('');
      setTo('');
      setReason('');
    }
  }

  function openEdit() {
    resetDeliveryForm(order);
    setError(null);
    setEditing(true);
  }

  function cancelEdit() {
    resetDeliveryForm(order);
    setError(null);
    setEditing(false);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    if (!from) {
      setError('Pick an "expected from" date.');
      return;
    }
    if (to && to < from) {
      setError('"Expected to" can\'t be before "expected from".');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateOrderDeliveryDate(id, {
        deliveryDateFrom: from,
        deliveryDateTo: to || from,
        reason: reason.trim() || null,
      });
      setOrder(updated);
      resetDeliveryForm(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not update delivery date.');
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusUpdate(e: FormEvent) {
    e.preventDefault();
    if (!id || !nextStatus) return;
    setStatusSaving(true);
    setError(null);
    try {
      const updated = await updateOrderStatus(id, { status: nextStatus });
      setOrder(updated);
      const options = nextStatuses(updated.status);
      setNextStatus(options[0] ?? '');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not update production status.');
    } finally {
      setStatusSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="loading-state">
        <p>Loading order…</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="error-state">
        <h3>Order not found</h3>
        <p>{error}</p>
        <Link to="/orders" className="btn">Back to orders</Link>
      </div>
    );
  }

  const delivery = order.delivery;
  const hasPhysicalItems = order.items.some((item) => item.itemType === 'Product');
  const backTo = hasPhysicalItems ? '/orders' : '/course-orders';
  const backLabel = hasPhysicalItems ? 'Back to product orders' : 'Back to course & video orders';
  const statusOptions = nextStatuses(order.status);

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-header__title">{order.orderNumber}</h1>
          <p className="page-header__subtitle">
            {order.customerName} · {order.customerPhone} · {order.paymentMethod}
          </p>
        </div>
        <div className="page-header__actions">
          <Link to={backTo} className="btn btn--ghost">{backLabel}</Link>
        </div>
      </header>

      {error && <div className="form-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <dl style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '12px 24px' }}>
          <dt style={{ fontWeight: 600, color: 'var(--vivi-muted)' }}>Status</dt>
          <dd>{STATUS_LABELS[order.status] ?? order.status}</dd>
          <dt style={{ fontWeight: 600, color: 'var(--vivi-muted)' }}>Payment</dt>
          <dd>{order.paymentStatus ?? '—'} · {order.paymentMethod}</dd>
          <dt style={{ fontWeight: 600, color: 'var(--vivi-muted)' }}>Amount</dt>
          <dd>{formatInr(order.totalAmount)}</dd>
          <dt style={{ fontWeight: 600, color: 'var(--vivi-muted)' }}>Placed</dt>
          <dd>{formatDate(order.createdAt)}</dd>
          <dt style={{ fontWeight: 600, color: 'var(--vivi-muted)' }}>Customer</dt>
          <dd>{order.customerName} · {order.customerEmail}</dd>
        </dl>
      </div>

      {hasPhysicalItems && statusOptions.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Production status</h2>
          <p className="page-header__subtitle" style={{ marginTop: 0 }}>
            Current: <strong>{STATUS_LABELS[order.status] ?? order.status}</strong>
            {' · '}
            Mark dispatched when the parcel leaves Vivi.
          </p>
          <form onSubmit={(e) => void handleStatusUpdate(e)} className="form-grid" style={{ marginTop: 12 }}>
            <div className="form-field">
              <label htmlFor="status">Move to</label>
              <select
                id="status"
                value={nextStatus}
                onChange={(e) => setNextStatus(e.target.value as OrderStatus)}
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status] ?? status}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-grid--full" style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn--primary" disabled={statusSaving || !nextStatus}>
                {statusSaving ? 'Updating…' : 'Update status'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Items</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id}>
                <td>{item.itemNameSnapshot}</td>
                <td>{item.quantity}</td>
                <td>{formatInr(item.totalAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {order.shippingAddress && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Delivery address</h2>
          <p>
            {order.shippingAddress.fullName}<br />
            {order.shippingAddress.addressLine1}<br />
            {order.shippingAddress.addressLine2 ? <>{order.shippingAddress.addressLine2}<br /></> : null}
            {order.shippingAddress.landmark ? <>{order.shippingAddress.landmark}<br /></> : null}
            {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.pinCode}<br />
            {order.shippingAddress.country}
          </p>
        </div>
      )}

      {delivery && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Delivery date</h2>
          <p>
            Default system estimate:{' '}
            <strong>{formatDay(delivery.systemFrom)}{delivery.systemFrom !== delivery.systemTo ? ` – ${formatDay(delivery.systemTo)}` : ''}</strong>
            {' '}({delivery.estimateSummary}, {delivery.locationLabel})
          </p>
          <p>
            Current customer-facing date:{' '}
            <strong>{formatDay(delivery.expectedFrom)}{delivery.expectedFrom !== delivery.expectedTo ? ` – ${formatDay(delivery.expectedTo)}` : ''}</strong>
            {delivery.isOverridden ? ' · Manually overridden' : ''}
          </p>
          {delivery.isOverridden && order.overriddenByName && (
            <p className="page-header__subtitle">
              Changed by {order.overriddenByName}
              {order.overriddenAt ? ` on ${formatDate(order.overriddenAt)}` : ''}
              {order.overrideReason ? ` — ${order.overrideReason}` : ''}
            </p>
          )}

          {!editing && (
            <button type="button" className="btn btn--primary" style={{ marginTop: 4 }} onClick={openEdit}>
              Edit delivery date
            </button>
          )}

          {editing && (
            <form onSubmit={handleSave} className="form-grid" style={{ marginTop: 16 }}>
              <div className="form-field">
                <label htmlFor="from">Expected from</label>
                <input id="from" type="date" required value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="form-field">
                <label htmlFor="to">Expected to</label>
                <input id="to" type="date" min={from || undefined} value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <div className="form-field form-grid--full">
                <label htmlFor="reason">Reason (optional)</label>
                <input
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Handmade production delay"
                  maxLength={400}
                />
              </div>
              <div className="form-grid--full" style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn--primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button type="button" className="btn btn--ghost" disabled={saving} onClick={cancelEdit}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {order.deliveryHistory.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Delivery date history</h2>
          <ul>
            {order.deliveryHistory.map((entry) => (
              <li key={entry.id}>
                {formatDay(entry.previousFrom)}
                {entry.previousFrom !== entry.previousTo ? ` – ${formatDay(entry.previousTo)}` : ''}
                {' → '}
                {formatDay(entry.newFrom)}
                {entry.newFrom !== entry.newTo ? ` – ${formatDay(entry.newTo)}` : ''}
                {' · '}
                {entry.changedByName || 'Admin'}
                {' · '}
                {formatDate(entry.changedAt)}
                {entry.reason ? ` — ${entry.reason}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
