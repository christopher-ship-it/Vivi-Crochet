import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiClientError } from '../api/client';
import {
  listSupportInquiries,
  markSupportInquiryRead,
  replySupportInquiry,
  type AdminSupportInquiry,
} from '../api/support';
import { formatDate } from '../utils/format';

const MUTED = 'var(--muted, #7a6d72)';

export function SupportPage() {
  const [items, setItems] = useState<AdminSupportInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openCustomerId, setOpenCustomerId] = useState<string | null>(null);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

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

  // One entry per customer; the API returns newest first, so the first message is the latest.
  const threads = useMemo(() => {
    const byCustomer = new Map<string, AdminSupportInquiry[]>();
    for (const item of items) {
      const list = byCustomer.get(item.customerId);
      if (list) list.push(item);
      else byCustomer.set(item.customerId, [item]);
    }
    return [...byCustomer.values()];
  }, [items]);

  const openThread = threads.find((t) => t[0].customerId === openCustomerId) ?? null;
  const chronological = openThread ? [...openThread].reverse() : [];

  function closeThread() {
    setOpenCustomerId(null);
    setReplyingId(null);
    setDraft('');
  }

  async function openChat(thread: AdminSupportInquiry[]) {
    setOpenCustomerId(thread[0].customerId);
    const unreadIds = thread.filter((m) => !m.isRead).map((m) => m.id);
    if (unreadIds.length === 0) return;
    try {
      await Promise.all(unreadIds.map((id) => markSupportInquiryRead(id)));
      setItems((prev) => prev.map((row) => (unreadIds.includes(row.id) ? { ...row, isRead: true } : row)));
      window.dispatchEvent(new CustomEvent('vivi:support-unread-refresh'));
    } catch {
      // Marking read is best-effort; the thread still opens.
    }
  }

  async function handleReply(id: string) {
    const reply = draft.trim();
    if (!reply) return;
    setSending(true);
    try {
      await replySupportInquiry(id, reply);
      setItems((prev) =>
        prev.map((row) =>
          row.id === id ? { ...row, isRead: true, reply, repliedAt: new Date().toISOString() } : row,
        ),
      );
      setReplyingId(null);
      setDraft('');
      window.dispatchEvent(new CustomEvent('vivi:support-unread-refresh'));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not send reply.');
    } finally {
      setSending(false);
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
          <h3>Support problem</h3>
          <p>{error}</p>
        </div>
      )}

      {!loading && items.length === 0 && !error && (
        <div className="empty-state">
          <h3>No support queries yet</h3>
          <p>When a customer uses Chat with us, their message will show here.</p>
        </div>
      )}

      {!loading && threads.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Contact</th>
                <th>Latest query</th>
                <th>Received</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {threads.map((thread) => {
                const latest = thread[0];
                const hasUnread = thread.some((m) => !m.isRead);
                return (
                  <tr key={latest.customerId} className={hasUnread ? 'data-table__row--unread' : undefined}>
                    <td style={{ fontWeight: 600 }}>{latest.customerName || '—'}</td>
                    <td>
                      <div>{latest.phoneNumber || '—'}</div>
                      <div style={{ color: MUTED, fontSize: 13 }}>{latest.email || ''}</div>
                    </td>
                    <td style={{ maxWidth: 420, whiteSpace: 'pre-wrap' }}>
                      {latest.message}
                      {thread.length > 1 ? (
                        <div style={{ color: MUTED, fontSize: 13 }}>{thread.length} messages</div>
                      ) : null}
                    </td>
                    <td>{formatDate(latest.createdAt)}</td>
                    <td>
                      <span className={`badge ${hasUnread ? 'badge--pending' : 'badge--inactive'}`}>
                        {hasUnread ? 'Unread' : 'Read'}
                      </span>
                    </td>
                    <td>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => void openChat(thread)}>
                        Open chat
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {openThread && (
        <div className="modal-backdrop" role="presentation" onClick={closeThread}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Support conversation"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal__header">
              <div>
                <h2 className="modal__title">{openThread[0].customerName || 'Customer'}</h2>
                <div style={{ color: MUTED, fontSize: 13 }}>
                  {[openThread[0].phoneNumber, openThread[0].email].filter(Boolean).join(' · ')}
                </div>
              </div>
              <button type="button" className="btn btn--ghost btn--sm" onClick={closeThread}>
                Close
              </button>
            </div>

            <div style={{ display: 'grid', gap: 14, maxHeight: '55vh', overflowY: 'auto' }}>
              {chronological.map((m) => (
                <div key={m.id} style={{ display: 'grid', gap: 6 }}>
                  <div style={{ justifySelf: 'start', maxWidth: '85%' }}>
                    <div style={{ background: '#f3f1f2', borderRadius: 14, padding: '10px 14px', whiteSpace: 'pre-wrap' }}>
                      {m.message}
                    </div>
                    <div style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>{formatDate(m.createdAt)}</div>
                  </div>

                  {m.reply && replyingId !== m.id ? (
                    <div style={{ justifySelf: 'end', maxWidth: '85%' }}>
                      <div style={{ background: '#fde8ef', borderRadius: 14, padding: '10px 14px', whiteSpace: 'pre-wrap' }}>
                        {m.reply}
                      </div>
                      <div style={{ color: MUTED, fontSize: 12, marginTop: 2, textAlign: 'right' }}>
                        {m.repliedAt ? formatDate(m.repliedAt) : ''} ·{' '}
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => {
                            setReplyingId(m.id);
                            setDraft(m.reply ?? '');
                          }}
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {replyingId === m.id ? (
                    <div style={{ display: 'grid', gap: 6 }}>
                      <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        maxLength={2000}
                        rows={3}
                        autoFocus
                        placeholder="Type your reply — the customer sees it in the app"
                        style={{ width: '100%', padding: 8 }}
                      />
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setReplyingId(null)}>
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn btn--primary btn--sm"
                          disabled={sending || !draft.trim()}
                          onClick={() => void handleReply(m.id)}
                        >
                          {sending ? 'Sending…' : 'Send reply'}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {!m.reply && replyingId !== m.id ? (
                    <div style={{ justifySelf: 'end' }}>
                      <button
                        type="button"
                        className="btn btn--primary btn--sm"
                        onClick={() => {
                          setReplyingId(m.id);
                          setDraft('');
                        }}
                      >
                        Reply
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
