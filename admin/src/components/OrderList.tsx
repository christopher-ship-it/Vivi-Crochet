import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { deleteAdminOrder, listAdminOrders } from '../api/orders';
import { ApiClientError } from '../api/client';
import type { AdminOrderListItem } from '../types';
import { formatInr } from '../utils/format';
import { downloadExcel, type ExcelColumn } from '../utils/exportExcel';
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

const ROOM_LABEL: Record<string, string> = {
  Handmade: 'Handmade',
  Essentials: 'Crochet Essentials',
  Combined: 'Combined',
};

type ColumnDef = {
  id: string;
  label: string;
  width: number;
  /** Shown only on the product-orders page (shop items). */
  shopOnly?: boolean;
  /** Cannot be hidden. */
  locked?: boolean;
  clip?: boolean;
  render: (order: AdminOrderListItem) => ReactNode;
  title?: (order: AdminOrderListItem) => string | undefined;
};

const COLUMNS: ColumnDef[] = [
  {
    id: 'order', label: 'Order', width: 168, locked: true, clip: true,
    render: (o) => <span style={{ fontWeight: 600 }}>{o.orderNumber}</span>,
    title: (o) => o.orderNumber,
  },
  { id: 'customer', label: 'Customer', width: 110, clip: true, render: (o) => displayOrDash(o.customerName), title: (o) => displayOrDash(o.customerName) },
  { id: 'email', label: 'Email', width: 200, clip: true, render: (o) => displayOrDash(o.customerEmail), title: (o) => displayOrDash(o.customerEmail) },
  { id: 'phone', label: 'Phone', width: 120, clip: true, render: (o) => displayOrDash(o.customerPhone), title: (o) => displayOrDash(o.customerPhone) },
  { id: 'title', label: 'Title', width: 170, clip: true, render: (o) => displayOrDash(o.titleSummary), title: (o) => displayOrDash(o.titleSummary) },
  { id: 'productId', label: 'Product ID', width: 130, shopOnly: true, clip: true, render: (o) => displayOrDash(o.productCodes), title: (o) => displayOrDash(o.productCodes) },
  { id: 'quantity', label: 'Qty', width: 60, shopOnly: true, render: (o) => (o.hasPhysicalItems && o.productQuantity !== undefined ? o.productQuantity : '—') },
  {
    id: 'category', label: 'Category', width: 140, shopOnly: true, clip: true,
    render: (o) => (o.productRoom ? ROOM_LABEL[o.productRoom] ?? o.productRoom : '—'),
  },
  { id: 'amount', label: 'Amount', width: 96, render: (o) => formatInr(o.totalAmount) },
  { id: 'payment', label: 'Payment', width: 96, render: (o) => o.paymentStatus ?? '—' },
  {
    id: 'status', label: 'Status', width: 120,
    render: (o) => (
      <span className={`badge badge--${o.status.toLowerCase()}`}>
        {o.status === 'Shipped' ? 'Dispatched' : o.status === 'InProduction' ? 'In production' : o.status}
      </span>
    ),
  },
  {
    id: 'delivery', label: 'Delivery', width: 140, clip: true,
    render: (o) =>
      o.hasPhysicalItems
        ? o.deliveryDateOverridden
          ? `Overridden · ${o.deliveryLabel ?? ''}`
          : (o.deliveryLabel ?? '—')
        : 'Digital',
  },
];

const ACTIONS_WIDTH = 60;

/** Plain values written to Excel for each column id (numbers stay numeric). */
const EXCEL_VALUE: Record<string, (o: AdminOrderListItem) => string | number | null> = {
  order: (o) => o.orderNumber,
  customer: (o) => o.customerName,
  email: (o) => o.customerEmail ?? null,
  phone: (o) => o.customerPhone,
  title: (o) => o.titleSummary ?? null,
  productId: (o) => o.productCodes ?? null,
  quantity: (o) => (o.hasPhysicalItems ? (o.productQuantity ?? null) : null),
  category: (o) => (o.productRoom ? ROOM_LABEL[o.productRoom] ?? o.productRoom : null),
  amount: (o) => o.totalAmount,
  payment: (o) => o.paymentStatus ?? null,
  status: (o) => (o.status === 'Shipped' ? 'Dispatched' : o.status === 'InProduction' ? 'In production' : o.status),
  delivery: (o) =>
    o.hasPhysicalItems
      ? o.deliveryDateOverridden
        ? `Overridden · ${o.deliveryLabel ?? ''}`
        : (o.deliveryLabel ?? null)
      : 'Digital',
};

function readHidden(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
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

  const storageKey = `vivi.admin.orderColumns.${showDelivery ? 'shop' : 'digital'}`;
  const [hidden, setHidden] = useState<string[]>(() => readHidden(storageKey));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Columns this page can offer (delivery + shop columns only apply to physical orders).
  const available = useMemo(
    () => COLUMNS.filter((c) => (showDelivery ? true : !c.shopOnly && c.id !== 'delivery')),
    [showDelivery],
  );
  const columns = available.filter((c) => c.locked || !hidden.includes(c.id));
  const tableWidth = columns.reduce((sum, c) => sum + c.width, ACTIONS_WIDTH);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(hidden));
    } catch {
      // Preference is a convenience only.
    }
  }, [hidden, storageKey]);

  useEffect(() => {
    if (!pickerOpen) return;
    function onDown(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPickerOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [pickerOpen]);

  function toggleColumn(id: string) {
    setHidden((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

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

  async function handleExport() {
    setExporting(true);
    try {
      const sheetColumns: ExcelColumn<AdminOrderListItem>[] = [
        ...columns.map((c) => ({
          header: c.label,
          width: Math.max(10, Math.round(c.width / 7)),
          value: EXCEL_VALUE[c.id],
        })),
        { header: 'Placed on', width: 20, value: (o: AdminOrderListItem) => new Date(o.createdAt) },
      ];
      await downloadExcel(showDelivery ? 'product-orders' : 'course-orders', 'Orders', sheetColumns, visibleOrders);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the Excel file.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-header__title">{title}</h1>
          <p className="page-header__subtitle">{subtitle}</p>
        </div>
      </header>

      {!loading && visibleOrders.length > 0 && (
        <div className="page-toolbar">
          <div className="column-picker" ref={pickerRef}>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              aria-haspopup="true"
              aria-expanded={pickerOpen}
              onClick={() => setPickerOpen((v) => !v)}
            >
              Columns ({columns.length}/{available.length})
            </button>
            {pickerOpen && (
              <div className="column-picker__panel" role="group" aria-label="Choose columns">
                {available.map((c) => (
                  <label key={c.id} className={`column-picker__item${c.locked ? ' column-picker__item--locked' : ''}`}>
                    <input
                      type="checkbox"
                      checked={c.locked || !hidden.includes(c.id)}
                      disabled={c.locked}
                      onChange={() => toggleColumn(c.id)}
                    />
                    <span>{c.label}</span>
                  </label>
                ))}
                {hidden.length > 0 && (
                  <button type="button" className="btn btn--ghost btn--sm column-picker__reset" onClick={() => setHidden([])}>
                    Show all
                  </button>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            disabled={exporting}
            onClick={() => void handleExport()}
          >
            {exporting ? 'Preparing…' : 'Download Excel'}
          </button>
        </div>
      )}

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
          <table className="data-table data-table--orders" style={{ minWidth: tableWidth }}>
            <colgroup>
              {columns.map((c) => (
                <col key={c.id} style={{ width: c.width }} />
              ))}
              <col style={{ width: ACTIONS_WIDTH }} />
            </colgroup>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.id}>{c.label}</th>
                ))}
                <th className="col-actions" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {visibleOrders.map((order) => (
                <tr key={order.id}>
                  {columns.map((c) => {
                    const tip = c.title?.(order);
                    return (
                      <td
                        key={c.id}
                        className={c.clip ? 'col-clip' : c.id === 'amount' || c.id === 'payment' ? 'col-nowrap' : undefined}
                        title={tip === '—' ? undefined : tip}
                      >
                        {c.render(order)}
                      </td>
                    );
                  })}
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
