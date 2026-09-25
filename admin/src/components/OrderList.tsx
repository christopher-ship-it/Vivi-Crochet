import { useEffect, useState } from 'react';
import { deleteAdminOrder, listAdminOrders } from '../api/orders';
import { ApiClientError } from '../api/client';
import type { AdminOrderListItem } from '../types';
import { formatInr } from '../utils/format';
import { RowActionsMenu } from './RowActionsMenu';
import { confirmDialog } from './AppDialog';

interface OrderListProps {
  title: string;
  subtitle: string;
  /** Which orders from the full admin order list this page should show. */
  filter: (order: AdminOrderListItem) => boolean;
  /** Physical orders have a delivery date/address worth a column; digital-only orders don't. */
  showDelivery: boolean;
  emptyTitle: string;
  emptyMessage: string;
  loadErrorMessage: string;
}

function displayOrDash(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : '—';
}

/**
 * Shared table for the two order-tracking pages (product orders, course &
 * video orders). Both pull from the same admin order list and split it
 * client-side — there's no separate API per order type, so this keeps the
 * two pages' fetch/render logic in sync.
 */
export function OrderList({
  title,
  subtitle,
  filter,
  showDelivery,
  emptyTitle,
  emptyMessage,
  loadErrorMessage,
}: OrderListProps) {
  const [orders, setOrders] = useState<AdminOrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await listAdminOrders();
        if (!cancelled) setOrders(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : loadErrorMessage);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [loadErrorMessage]);

  async function handleDelete(order: AdminOrderListItem) {
    const ok = await confirmDialog(
      `Delete order ${order.orderNumber}?\n\nThis permanently removes the order, payments, and any linked course access or live bookings. Product stock is restored when it was deducted. This cannot be undone.`,
    );
    if (!ok) return;

    setDeletingId(order.id);
    setError(null);
    try {
      await deleteAdminOrder(order.id);
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to delete order.');
    } finally {
      setDeletingId(null);
    }
  }

  const visibleOrders = orders.filter(filter);

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-header__title">{title}</h1>
          <p className="page-header__subtitle">{subtitle}</p>
        </div>
      </header>

      {loading && (
        <div className="loading-state">
          <p>Loading orders…</p>
        </div>
      )}

      {error && (
        <div className="error-state">
          <h3>Could not load orders</h3>
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && visibleOrders.length === 0 && (
        <div className="empty-state">
          <h3>{emptyTitle}</h3>
          <p>{emptyMessage}</p>
        </div>
      )}

      {!loading && visibleOrders.length > 0 && (
        <div className="table-wrap">
          <table className={`data-table data-table--orders${showDelivery ? ' data-table--orders-delivery' : ''}`}>
            <colgroup>
              <col className="col-order" />
              <col className="col-customer" />
              <col className="col-email" />
              <col className="col-phone" />
              <col className="col-title" />
              <col className="col-amount" />
              <col className="col-payment" />
              <col className="col-status" />
              {showDelivery && <col className="col-delivery" />}
              <col className="col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th className="col-order">Order</th>
                <th className="col-customer">Customer</th>
                <th className="col-email">Email</th>
                <th className="col-phone">Phone</th>
                <th className="col-title">Title</th>
                <th className="col-amount">Amount</th>
                <th className="col-payment">Payment</th>
                <th className="col-status">Status</th>
                {showDelivery && <th className="col-delivery">Delivery</th>}
                <th className="col-actions" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {visibleOrders.map((order) => {
                const titleText = displayOrDash(order.titleSummary);
                const emailText = displayOrDash(order.customerEmail);
                const phoneText = displayOrDash(order.customerPhone);
                return (
                  <tr key={order.id}>
                    <td className="col-order col-clip" style={{ fontWeight: 600 }} title={order.orderNumber}>
                      {order.orderNumber}
                    </td>
                    <td className="col-customer col-clip" title={displayOrDash(order.customerName)}>
                      {displayOrDash(order.customerName)}
                    </td>
                    <td className="col-email col-clip" title={emailText === '—' ? undefined : emailText}>
                      {emailText}
                    </td>
                    <td className="col-phone col-clip" title={phoneText === '—' ? undefined : phoneText}>
                      {phoneText}
                    </td>
                    <td className="col-title col-clip" title={titleText === '—' ? undefined : titleText}>
                      {titleText}
                    </td>
                    <td className="col-amount">{formatInr(order.totalAmount)}</td>
                    <td className="col-payment">{order.paymentStatus ?? '—'}</td>
                    <td className="col-status">
                      <span className={`badge badge--${order.status.toLowerCase()}`}>
                        {order.status === 'Shipped'
                          ? 'Dispatched'
                          : order.status === 'InProduction'
                            ? 'In production'
                            : order.status}
                      </span>
                    </td>
                    {showDelivery && (
                      <td className="col-delivery col-clip">
                        {order.hasPhysicalItems
                          ? order.deliveryDateOverridden
                            ? `Overridden · ${order.deliveryLabel ?? ''}`
                            : (order.deliveryLabel ?? '—')
                          : 'Digital'}
                      </td>
                    )}
                    <td className="col-actions">
                      <div className="data-table__actions">
                        <RowActionsMenu
                          label={`Actions for order ${order.orderNumber}`}
                          disabled={deletingId === order.id}
                          items={[
                            { id: 'view', label: 'View order', to: `/orders/${order.id}` },
                            {
                              id: 'delete',
                              label: deletingId === order.id ? 'Deleting…' : 'Delete order',
                              danger: true,
                              disabled: deletingId === order.id,
                              onClick: () => void handleDelete(order),
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
