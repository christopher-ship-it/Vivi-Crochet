import { useCallback, useEffect, useState } from 'react';
import { ApiClientError } from '../api/client';
import {
  listSupportInquiries,
  markSupportInquiryRead,
  type AdminSupportInquiry,
} from '../api/support';
import { formatDate } from '../utils/format';

export function SupportPage() {
  const [items, setItems] = useState<AdminSupportInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listSupportInquiries());
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load support queries.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleMarkRead(id: string) {
    setMarkingId(id);
    try {
      await markSupportInquiryRead(id);
      setItems((prev) => prev.map((row) => (row.id === id ? { ...row, isRead: true } : row)));
      window.dispatchEvent(new CustomEvent('vivi:support-unread-refresh'));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not mark as read.');
    } finally {
      setMarkingId(null);
    }
  }

  const unread = items.filter((i) => !i.isRead).length;

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-header__title">Support</h1>
          <p className="page-header__subtitle">
            Queries customers send from Chat with us in the app.
            {unread > 0 ? ` ${unread} unread.` : ''}
          </p>
        </div>
        <div className="page-header__actions">
          <button type="button" className="btn btn--sm" onClick={() => void load()} disabled={loading}>
            Refresh
          </button>
        </div>
      </header>

      {loading && (
        <div className="loading-state">
          <p>Loading support queries…</p>
        </div>
      )}

      {error && (
        <div className="error-state">
          <h3>Could not load support</h3>
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="empty-state">
          <h3>No support queries yet</h3>
          <p>When a customer uses Chat with us, their message will show here.</p>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Contact</th>
                <th>Query</th>
                <th>Received</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className={item.isRead ? undefined : 'data-table__row--unread'}>
                  <td style={{ fontWeight: 600 }}>{item.customerName || '—'}</td>
                  <td>
                    <div>{item.phoneNumber || '—'}</div>
                    <div style={{ color: 'var(--muted, #7a6d72)', fontSize: 13 }}>
                      {item.email || ''}
                    </div>
                  </td>
                  <td style={{ maxWidth: 420, whiteSpace: 'pre-wrap' }}>{item.message}</td>
                  <td>{formatDate(item.createdAt)}</td>
                  <td>
                    <span className={`badge ${item.isRead ? 'badge--inactive' : 'badge--pending'}`}>
                      {item.isRead ? 'Read' : 'Unread'}
                    </span>
                  </td>
                  <td>
                    {!item.isRead ? (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        disabled={markingId === item.id}
                        onClick={() => void handleMarkRead(item.id)}
                      >
                        {markingId === item.id ? 'Saving…' : 'Mark read'}
                      </button>
                    ) : null}
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
