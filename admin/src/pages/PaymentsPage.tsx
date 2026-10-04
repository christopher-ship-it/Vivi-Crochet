import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listAdminPayments } from '../api/payments';
import { deleteAdminOrder } from '../api/orders';
import { ApiClientError } from '../api/client';
import type { AdminPaymentListItem, AdminPaymentsResponse, PaymentSource, PaymentStatus } from '../types';
import { formatDate, formatMoney, parseApiDate } from '../utils/format';
import { downloadExcel, type ExcelColumn } from '../utils/exportExcel';

const SOURCES: { id: PaymentSource | ''; label: string }[] = [
  { id: '', label: 'All payments' },
  { id: 'Product', label: 'Products' },
  { id: 'Course', label: 'Courses & videos' },
  { id: 'Live', label: 'Live classes' },
];

const SOURCE_LABEL: Record<PaymentSource, string> = {
  Product: 'Product',
  Course: 'Course / video',
  Live: 'Live class',
};

const STATUSES: PaymentStatus[] = ['Captured', 'Created', 'Authorized', 'Failed', 'Refunded'];

const STATUS_BADGE: Record<PaymentStatus, string> = {
  Captured: 'badge badge--paid',
  Created: 'badge badge--pending',
  Authorized: 'badge badge--pending',
  Failed: 'badge badge--failed',
  Refunded: 'badge badge--inactive',
};

const STATUS_LABEL: Record<PaymentStatus, string> = {
  Captured: 'Paid',
  Created: 'Awaiting payment',
  Authorized: 'Authorized',
  Failed: 'Failed',
  Refunded: 'Refunded',
};

function displayOrDash(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : '—';
}

/** "₹1,500", or "₹1,500 + $20" when a source has money in more than one currency. */
function sumLabel(totals: { currency: string; value: number }[]): string {
  const nonZero = totals.filter((t) => t.value !== 0);
  if (nonZero.length === 0) return formatMoney(0, 'INR');
  return nonZero.map((t) => formatMoney(t.value, t.currency)).join(' + ');
}

export function PaymentsPage() {
  const [data, setData] = useState<AdminPaymentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<PaymentSource | ''>('');
  const [status, setStatus] = useState<PaymentStatus | ''>('');
  const [query, setQuery] = useState('');
  const [exporting, setExporting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setData(await listAdminPayments());
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load payments.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const payments = data?.payments;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (payments ?? []).filter((p) => {
      if (source && p.source !== source) return false;
      if (status && p.status !== status) return false;
      if (!q) return true;
      return [p.orderNumber, p.customerName, p.customerEmail, p.customerPhone, p.titleSummary, p.providerPaymentId, p.providerOrderId]
        .some((v) => (v ?? '').toLowerCase().includes(q));
    });
  }, [payments, source, status, query]);

  const cards = useMemo(() => {
    const totals = data?.totals ?? [];
    const card = (label: string, s: PaymentSource | null) => {
      const list = totals.filter((t) => s === null || t.source === s);
      const byCurrency = new Map<string, number>();
      for (const t of list) byCurrency.set(t.currency, (byCurrency.get(t.currency) ?? 0) + t.collected);
      return {
        label,
        amount: sumLabel([...byCurrency].map(([currency, value]) => ({ currency, value }))),
        paid: list.reduce((n, t) => n + t.capturedCount, 0),
        pending: list.reduce((n, t) => n + t.pendingCount, 0),
        failed: list.reduce((n, t) => n + t.failedCount, 0),
      };
    };
    return [
      card('Total collected', null),
      card('Products', 'Product'),
      card('Courses & videos', 'Course'),
      card('Live classes', 'Live'),
    ];
  }, [data]);

  async function handleDelete(p: AdminPaymentListItem) {
    const ok = window.confirm(
      `Delete test transaction ${p.orderNumber}?\n\nThis permanently removes the order and its payments, so it no longer counts in revenue. This cannot be undone.`,
    );
    if (!ok) return;
    setDeletingId(p.id);
    setError(null);
    try {
      await deleteAdminOrder(p.orderId);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to delete the transaction.');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const columns: ExcelColumn<AdminPaymentListItem>[] = [
        { header: 'Date', width: 20, value: (p) => parseApiDate(p.createdAt) },
        { header: 'Order', width: 20, value: (p) => p.orderNumber },
        { header: 'Type', width: 16, value: (p) => SOURCE_LABEL[p.source] },
        { header: 'Item', width: 30, value: (p) => p.titleSummary },
        { header: 'Customer', width: 22, value: (p) => p.customerName },
        { header: 'Email', width: 28, value: (p) => p.customerEmail },
        { header: 'Phone', width: 16, value: (p) => p.customerPhone },
        { header: 'Amount', width: 12, value: (p) => p.amount },
        { header: 'Currency', width: 10, value: (p) => p.currency },
        { header: 'Status', width: 16, value: (p) => STATUS_LABEL[p.status] },
        { header: 'Razorpay payment ID', width: 26, value: (p) => p.providerPaymentId },
        { header: 'Razorpay order ID', width: 26, value: (p) => p.providerOrderId },
        { header: 'Paid on', width: 20, value: (p) => (p.completedAt ? parseApiDate(p.completedAt) : null) },
      ];
      await downloadExcel('payments', 'Payments', columns, rows);
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
          <h1 className="page-header__title">Payments</h1>
          <p className="page-header__subtitle">
            Every online payment across shop products, courses &amp; videos, and live classes.
          </p>
        </div>
        <div className="page-toolbar" style={{ margin: 0 }}>
          <button type="button" className="btn btn--secondary btn--sm" disabled={loading} onClick={() => void load()}>
            Refresh
          </button>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            disabled={exporting || rows.length === 0}
            onClick={() => void handleExport()}
          >
            {exporting ? 'Preparing…' : 'Download Excel'}
          </button>
        </div>
      </header>

      {data && (
        <div className="stat-grid">
          {cards.map((c) => (
            <div key={c.label} className="card card--stat">
              <span className="card__label">{c.label}</span>
              <span className="card__value">{c.amount}</span>
              <span className="card__label" style={{ fontWeight: 400 }}>
                {c.paid} paid · {c.pending} awaiting · {c.failed} failed
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="tabs" role="tablist" style={{ marginTop: 'var(--space-6)' }}>
        {SOURCES.map((s) => (
          <button
            key={s.id || 'all'}
            type="button"
            role="tab"
            aria-selected={source === s.id}
            className={`tab${source === s.id ? ' tab--active' : ''}`}
            onClick={() => setSource(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="filter-bar">
        <div className="form-field filter-bar__search">
          <label htmlFor="payments-search">Search</label>
          <input
            id="payments-search"
            type="search"
            placeholder="Order, customer, email, phone, item or payment ID"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="form-field">
          <label htmlFor="payments-status">Status</label>
          <select id="payments-status" value={status} onChange={(e) => setStatus(e.target.value as PaymentStatus | '')}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && (
        <div className="loading-state">
          <p>Loading payments…</p>
        </div>
      )}

      {error && (
        <div className="error-state">
          <h3>Could not load payments</h3>
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="empty-state">
          <h3>No payments found</h3>
          <p>
            {(payments ?? []).length === 0
              ? 'Payments will appear here as customers check out.'
              : 'No payments match the current filters.'}
          </p>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="table-wrap">
          <table className="data-table data-table--orders" style={{ minWidth: 1180 }}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Order</th>
                <th>Type</th>
                <th>Item</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Payment ID</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="col-nowrap">{formatDate(p.createdAt)}</td>
                  <td className="col-nowrap">
                    <Link to={p.source === 'Live' ? '/live-bookings' : `/orders/${p.orderId}`} style={{ fontWeight: 600 }}>
                      {p.orderNumber}
                    </Link>
                  </td>
                  <td className="col-nowrap">{SOURCE_LABEL[p.source]}</td>
                  <td className="col-clip" title={p.titleSummary}>{displayOrDash(p.titleSummary)}</td>
                  <td className="col-clip" title={p.customerEmail}>
                    {displayOrDash(p.customerName)}
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{displayOrDash(p.customerEmail)}</div>
                  </td>
                  <td className="col-nowrap">{formatMoney(p.amount, p.currency)}</td>
                  <td className="col-nowrap">
                    <span className={STATUS_BADGE[p.status]}>{STATUS_LABEL[p.status]}</span>
                  </td>
                  <td className="col-clip" title={p.providerPaymentId ?? undefined}>
                    {displayOrDash(p.providerPaymentId)}
                  </td>
                  <td className="col-nowrap">
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      disabled={deletingId === p.id}
                      onClick={() => void handleDelete(p)}
                    >
                      {deletingId === p.id ? 'Deleting…' : 'Delete'}
                    </button>
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
