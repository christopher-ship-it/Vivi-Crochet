import { useCallback, useEffect, useState } from 'react';
import { ApiClientError } from '../api/client';
import {
  getFeedbackSummary,
  listFeedback,
  setFeedbackResolved,
  type AppFeedbackItem,
  type AppFeedbackSummary,
} from '../api/feedback';
import { formatDate } from '../utils/format';

type StatusFilter = 'all' | 'open' | 'resolved';

function errMessage(err: unknown, fallback: string): string {
  return err instanceof ApiClientError ? err.message : fallback;
}

/** What customers were looking for in the app and could not find. */
export function FeedbackPage() {
  const [summary, setSummary] = useState<AppFeedbackSummary | null>(null);
  const [items, setItems] = useState<AppFeedbackItem[]>([]);
  const [status, setStatus] = useState<StatusFilter>('open');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sum, list] = await Promise.all([
        getFeedbackSummary(),
        listFeedback(status === 'all' ? undefined : status),
      ]);
      setSummary(sum);
      setItems(list);
    } catch (err) {
      setError(errMessage(err, 'Could not load feedback.'));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(item: AppFeedbackItem) {
    try {
      await setFeedbackResolved(item.id, !item.isResolved);
      await load();
    } catch (err) {
      setError(errMessage(err, 'Could not update this item.'));
    }
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Couldn't find</h1>
        <p style={{ margin: '4px 0 0', color: '#6b6b6b' }}>
          What customers were looking for in the app and could not find. Sent from the prompt shown after 30 seconds in the app.
        </p>
      </div>

      {error ? <p style={{ color: '#b42318', margin: 0 }}>{error}</p> : null}

      {summary ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <Metric label="Total reports" value={String(summary.total)} />
          <Metric label="Last 7 days" value={String(summary.last7Days)} />
          <Metric label="Not yet handled" value={String(summary.unresolved)} />
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 8 }}>
        {(['open', 'resolved', 'all'] as StatusFilter[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            style={{
              padding: '6px 14px',
              borderRadius: 999,
              border: '0.5px solid #d9d9d9',
              background: status === s ? '#e8215b' : '#fff',
              color: status === s ? '#fff' : '#221a1e',
              cursor: 'pointer',
            }}
          >
            {s === 'open' ? 'Open' : s === 'resolved' ? 'Handled' : 'All'}
          </button>
        ))}
      </div>

      {loading ? <p style={{ color: '#6b6b6b' }}>Loading…</p> : null}
      {!loading && items.length === 0 ? <p style={{ color: '#6b6b6b' }}>Nothing in this view yet.</p> : null}

      <div style={{ display: 'grid', gap: 10 }}>
        {items.map((item) => (
          <div
            key={item.id}
            style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12, padding: 14, opacity: item.isResolved ? 0.6 : 1 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: '#6b6b6b' }}>Looking for</span>
              <span style={{ color: '#6b6b6b', fontSize: 13 }}>{formatDate(item.createdAt)}</span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 500 }}>{item.message ?? '—'}</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, gap: 12, flexWrap: 'wrap' }}>
              <span style={{ color: '#6b6b6b', fontSize: 12 }}>
                {[item.platform, item.appVersion ? `v${item.appVersion}` : null, `${item.secondsInApp}s in app`, item.screen]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              <button
                type="button"
                onClick={() => void toggle(item)}
                style={{ padding: '4px 12px', borderRadius: 8, border: '0.5px solid #d9d9d9', background: '#fff', cursor: 'pointer' }}
              >
                {item.isResolved ? 'Reopen' : 'Mark handled'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#f7f7f7', borderRadius: 12, padding: 14 }}>
      <div style={{ color: '#6b6b6b', fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 500, marginTop: 4 }}>{value}</div>
    </div>
  );
}
