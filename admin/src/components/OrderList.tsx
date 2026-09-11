import { useEffect, useState } from 'react';
import { listAdminOrders } from '../api/orders';
import { ApiClientError } from '../api/client';
import type { AdminOrderListItem } from '../types';
import { formatInr } from '../utils/format';
import { RowActionsMenu } from './RowActionsMenu';

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

/**
 * Shared table for the two order-tracking pages (product orders, course &
 * video orders). Both pull from the same admin order list and split it
 * client-side using `hasPhysicalItems` — there's no separate API per
 * order type, so this keeps the two pages' fetch/render logic in sync.
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
    return () => { cancelled = true; };
  }, [loadErrorMessage]);

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

      {!loading && !error && visibleOrders.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Phone</th>
                <th>Amount</th>
                <th>Payment</th>
                <th>Status</th>
                {showDelivery && <th>Delivery</th>}
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {visibleOrders.map((order) => (
                <tr key={order.id}>
                  <td style={{ fontWeight: 600 }}>{order.orderNumber}</td>
                  <td>{order.customerName || '—'}</td>
                  <td>{order.customerPhone || '—'}</td>
                  <td>{formatInr(order.totalAmount)}</td>
                  <td>{order.paymentStatus ?? '—'}</td>
                  <td>
                    <span className={`badge badge--${order.status.toLowerCase()}`}>
                      {order.status === 'Shipped' ? 'Dispatched' : order.status === 'InProduction' ? 'In production' : order.status}
                    </span>
                  </td>
                  {showDelivery && (
                    <td>
                      {order.hasPhysicalItems
                        ? (order.deliveryDateOverridden ? `Overridden · ${order.deliveryLabel ?? ''}` : (order.deliveryLabel ?? '—'))
                        : 'Digital'}
                    </td>
                  )}
                  <td>
                    <div className="data-table__actions">
                      <RowActionsMenu
                        label={`Actions for order ${order.orderNumber}`}
                        items={[{ id: 'view', label: 'View order', to: `/orders/${order.id}` }]}
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
