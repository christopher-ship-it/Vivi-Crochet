import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { deleteAdminOrder, getAdminOrder, updateOrderDeliveryDate, updateOrderStatus } from '../api/orders';
import { ApiClientError } from '../api/client';
import type { AdminOrderDetail, OrderStatus } from '../types';
import { formatDate, formatDay, formatInr } from '../utils/format';
import { confirmDialog } from '../components/AppDialog';

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

/** Physical-order progress shown as a stepper on the detail page. */
const PRODUCTION_STEPS: OrderStatus[] = ['Confirmed', 'InProduction', 'Shipped', 'Delivered'];

/** Maps an order / payment status to a badge colour modifier. */
function statusTone(status: string): string {
  const key = status.toLowerCase();
  if (['delivered', 'paid', 'captured', 'confirmed', 'success', 'succeeded'].includes(key)) return 'published';
  if (['cancelled', 'paymentfailed', 'failed', 'refunded'].includes(key)) return 'failed';
  if (['pendingpayment', 'pending', 'created'].includes(key)) return 'pending';
  return 'yes';
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
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

  async function handleDelete() {
    if (!id || !order) return;
    const ok = await confirmDialog(
      `Delete order ${order.orderNumber}?\n\nThis permanently removes the order, payments, and any linked course access or live bookings. Product stock is restored when it was deducted. This cannot be undone.`,
    );
    if (!ok) return;

    setDeleting(true);
    setError(null);
    try {
      await deleteAdminOrder(id);
      navigate(order.items.some((item) => item.itemType === 'Product') ? '/orders' : '/course-orders');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not delete order.');
      setDeleting(false);
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

  const currentStep = PRODUCTION_STEPS.indexOf(order.status);
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <>
      <header className="page-header page-header--compact order-head">
        <div>
          <div className="order-head__title-row">
            <h1 className="page-header__title">{order.orderNumber}</h1>
            <span className={`badge badge--${statusTone(order.status)}`}>
              {STATUS_LABELS[order.status] ?? order.status}
            </span>
            {order.paymentStatus ? (
              <span className={`badge badge--${statusTone(order.paymentStatus)}`}>
                {order.paymentStatus}
              </span>
            ) : null}
          </div>
          <p className="page-header__subtitle">
            Placed {formatDate(order.createdAt)} · {order.paymentMethod}
          </p>
        </div>
        <div className="page-header__actions">
          <Link to={backTo} className="btn btn--ghost btn--sm">← {backLabel}</Link>
          <button
            type="button"
            className="btn btn--danger btn--sm"
            disabled={deleting}
            onClick={() => void handleDelete()}
          >
            {deleting ? 'Deleting…' : 'Delete order'}
          </button>
        </div>
      </header>

      {error && <div className="form-error">{error}</div>}

      <div className="order-stats">
        <div className="order-stat">
          <span className="order-stat__label">Amount</span>
          <span className="order-stat__value">{formatInr(order.totalAmount)}</span>
        </div>
        <div className="order-stat">
          <span className="order-stat__label">Payment</span>
          <span className="order-stat__value order-stat__value--sm">
            {order.paymentStatus ?? '—'} · {order.paymentMethod}
          </span>
        </div>
        <div className="order-stat">
          <span className="order-stat__label">Placed</span>
          <span className="order-stat__value order-stat__value--sm">{formatDate(order.createdAt)}</span>
        </div>
        <div className="order-stat">
          <span className="order-stat__label">Items</span>
          <span className="order-stat__value">{itemCount}</span>
        </div>
      </div>

      <div className="order-layout">
        <div className="order-layout__main">
          <section className="card card--tight">
            <h2 className="card__title card__title--sm">Items</h2>
            <table className="data-table order-items">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="num">Qty</th>
                  <th className="num">Unit price</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span className="cell-strong">{item.itemNameSnapshot}</span>
                      <span className="order-items__type">{item.itemType}</span>
                    </td>
                    <td className="num">{item.quantity}</td>
                    <td className="num">{formatInr(item.unitPrice)}</td>
                    <td className="num cell-strong">{formatInr(item.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Order total</td>
                  <td className="num">{formatInr(order.totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </section>

          {delivery && (
            <section className="card card--tight">
              <div className="card__header card__header--tight">
                <h2 className="card__title card__title--sm">Delivery date</h2>
                {!editing && (
                  <button type="button" className="btn btn--ghost btn--sm" onClick={openEdit}>
                    Edit delivery date
                  </button>
                )}
              </div>
              <div className="order-dates">
                <div className="order-date">
                  <span className="order-stat__label">Default system estimate</span>
                  <strong>
                    {formatDay(delivery.systemFrom)}
                    {delivery.systemFrom !== delivery.systemTo ? ` – ${formatDay(delivery.systemTo)}` : ''}
                  </strong>
                  <span className="form-hint">{delivery.estimateSummary}, {delivery.locationLabel}</span>
                </div>
                <div className={`order-date order-date--current${delivery.isOverridden ? ' order-date--override' : ''}`}>
                  <span className="order-stat__label">
                    Current customer-facing date
                    {delivery.isOverridden ? <span className="badge badge--yes">Manually overridden</span> : null}
                  </span>
                  <strong>
                    {formatDay(delivery.expectedFrom)}
                    {delivery.expectedFrom !== delivery.expectedTo ? ` – ${formatDay(delivery.expectedTo)}` : ''}
                  </strong>
                  {delivery.isOverridden && order.overriddenByName ? (
                    <span className="form-hint">
                      Changed by {order.overriddenByName}
                      {order.overriddenAt ? ` on ${formatDate(order.overriddenAt)}` : ''}
                      {order.overrideReason ? ` — ${order.overrideReason}` : ''}
                    </span>
                  ) : null}
                </div>
              </div>

              {editing && (
                <form onSubmit={handleSave} className="order-date-form">
                  <div className="form-field">
                    <label htmlFor="from">Expected from</label>
                    <input id="from" type="date" required value={from} onChange={(e) => setFrom(e.target.value)} />
                  </div>
                  <div className="form-field">
                    <label htmlFor="to">Expected to</label>
                    <input id="to" type="date" min={from || undefined} value={to} onChange={(e) => setTo(e.target.value)} />
                  </div>
                  <div className="form-field order-date-form__reason">
                    <label htmlFor="reason">Reason (optional)</label>
                    <input
                      id="reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Handmade production delay"
                      maxLength={400}
                    />
                  </div>
                  <div className="order-date-form__actions">
                    <button type="submit" className="btn btn--primary" disabled={saving}>
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button type="button" className="btn btn--ghost" disabled={saving} onClick={cancelEdit}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </section>
          )}

          {order.deliveryHistory.length > 0 && (
            <section className="card card--tight">
              <h2 className="card__title card__title--sm">Delivery date history</h2>
              <ol className="order-timeline">
                {order.deliveryHistory.map((entry) => (
                  <li key={entry.id}>
                    <div className="order-timeline__change">
                      <span className="muted">
                        {formatDay(entry.previousFrom)}
                        {entry.previousFrom !== entry.previousTo ? ` – ${formatDay(entry.previousTo)}` : ''}
                      </span>
                      {' → '}
                      <strong>
                        {formatDay(entry.newFrom)}
                        {entry.newFrom !== entry.newTo ? ` – ${formatDay(entry.newTo)}` : ''}
                      </strong>
                    </div>
                    <div className="form-hint">
                      {entry.changedByName || 'Admin'} · {formatDate(entry.changedAt)}
                      {entry.reason ? ` — ${entry.reason}` : ''}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        <aside className="order-layout__side">
          {hasPhysicalItems && (
            <section className="card card--tight">
              <h2 className="card__title card__title--sm">Production status</h2>
              <ol className="order-steps">
                {PRODUCTION_STEPS.map((step, index) => (
                  <li
                    key={step}
                    className={[
                      'order-steps__step',
                      currentStep >= 0 && index < currentStep ? 'is-done' : '',
                      index === currentStep ? 'is-current' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <span className="order-steps__dot" aria-hidden />
                    {STATUS_LABELS[step] ?? step}
                  </li>
                ))}
              </ol>
              {statusOptions.length > 0 ? (
                <form onSubmit={(e) => void handleStatusUpdate(e)} className="order-status-form">
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
                  <button type="submit" className="btn btn--primary" disabled={statusSaving || !nextStatus}>
                    {statusSaving ? 'Updating…' : 'Update status'}
                  </button>
                  <p className="form-hint order-status-form__hint">Mark dispatched when the parcel leaves Vivi.</p>
                </form>
              ) : null}
            </section>
          )}

          <section className="card card--tight">
            <h2 className="card__title card__title--sm">Customer</h2>
            <dl className="detail-list detail-list--stacked">
              <dt>Name</dt>
              <dd>{order.customerName || '—'}</dd>
              <dt>Phone</dt>
              <dd>{order.customerPhone || '—'}</dd>
              <dt>Email</dt>
              <dd className="cell-clip" title={order.customerEmail}>{order.customerEmail || '—'}</dd>
            </dl>
          </section>

          {order.shippingAddress && (
            <section className="card card--tight">
              <h2 className="card__title card__title--sm">Delivery address</h2>
              <address className="order-address">
                <strong>{order.shippingAddress.fullName}</strong>
                {order.shippingAddress.addressLine1}<br />
                {order.shippingAddress.addressLine2 ? <>{order.shippingAddress.addressLine2}<br /></> : null}
                {order.shippingAddress.landmark ? <>{order.shippingAddress.landmark}<br /></> : null}
                {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.pinCode}<br />
                {order.shippingAddress.country}
              </address>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
