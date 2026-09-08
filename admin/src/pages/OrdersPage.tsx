import { useEffect, useState } from 'react';
import { listAdminOrders } from '../api/orders';
import { ApiClientError } from '../api/client';
import { RowActionsMenu } from '../components/RowActionsMenu';
import type { AdminOrderListItem } from '../types';
import { formatInr } from '../utils/format';

export function OrdersPage() {
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
          setError(err instanceof ApiClientError ? err.message : 'Failed to load orders.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-header__title">Orders</h1>
          <p className="page-header__subtitle">Online payments only. Delivery dates can be adjusted per order.</p>
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

      {!loading && !error && orders.length === 0 && (
        <div className="empty-state">
          <h3>No orders yet</h3>
          <p>Customer shop and course checkouts will appear here after they pay online.</p>
        </div>
      )}

      {!loading && !error && orders.length > 0 && (
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
                <th>Delivery</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td style={{ fontWeight: 600 }}>{order.orderNumber}</td>
                  <td>{order.customerName || '—'}</td>
                  <td>{order.customerPhone || '—'}</td>
                  <td>{formatInr(order.totalAmount)}</td>
                  <td>{order.paymentStatus ?? '—'}</td>
                  <td>
                    <span className={`badge badge--${order.status.toLowerCase()}`}>{order.status}</span>
                  </td>
                  <td>
                    {order.hasPhysicalItems
                      ? (order.deliveryDateOverridden ? `Overridden · ${order.deliveryLabel ?? ''}` : (order.deliveryLabel ?? '—'))
                      : 'Digital'}
                  </td>
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
