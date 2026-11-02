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

function stars(n: number): string {
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

/** What customers said after staying in the app for a while (the in-app feedback prompt). */
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
      setError(errMessage(err, 'Could not update this feedback.'));
    }
  }

  const maxCount = Math.max(1, ...(summary?.ratingCounts ?? [0]));

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>App feedback</h1>
        <p style={{ margin: '4px 0 0', color: '#6b6b6b' }}>
          Ratings and messages from customers who stayed in the app for 30 seconds or more.
        </p>
      </div>

      {error ? <p style={{ color: '#b42318', margin: 0 }}>{error}</p> : null}

      {summary ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <Metric label="Average rating" value={summary.total ? `${summary.averageRating} / 5` : '—'} />
          <Metric label="Total responses" value={String(summary.total)} />
          <Metric label="Last 7 days" value={String(summary.last7Days)} />
          <Metric label="Unresolved" value={String(summary.unresolved)} />
        </div>
      ) : null}

      {summary && summary.total > 0 ? (
        <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12, padding: 16 }}>
          <p style={{ margin: '0 0 10px', fontWeight: 600 }}>Ratings</p>
          {[5, 4, 3, 2, 1].map((star) => {
            const count = summary.ratingCounts[star - 1] ?? 0;
            return (
              <div key={star} style={{ display: 'grid', gridTemplateColumns: '64px 1fr 40px', gap: 10, alignItems: 'center', marginBottom: 6 }}>
                <span style={{ color: '#c8145a' }}>{stars(star)}</span>
                <div style={{ background: '#f3f3f3', borderRadius: 6, height: 10, overflow: 'hidden' }}>
                  <div style={{ width: `${(count / maxCount) * 100}%`, background: '#e8215b', height: '100%' }} />
                </div>
                <span style={{ textAlign: 'right', color: '#6b6b6b' }}>{count}</span>
              </div>
            );
          })}
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
            {s === 'open' ? 'Open' : s === 'resolved' ? 'Resolved' : 'All'}
          </button>
        ))}
      </div>

      {loading ? <p style={{ color: '#6b6b6b' }}>Loading…</p> : null}
      {!loading && items.length === 0 ? <p style={{ color: '#6b6b6b' }}>No feedback in this view yet.</p> : null}

      <div style={{ display: 'grid', gap: 10 }}>
        {items.map((item) => (
          <div
            key={item.id}
            style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12, padding: 14, opacity: item.isResolved ? 0.6 : 1 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <span style={{ color: '#c8145a', fontSize: 16 }}>{stars(item.rating)}</span>
              <span style={{ color: '#6b6b6b', fontSize: 13 }}>{formatDate(item.createdAt)}</span>
            </div>
            {item.message ? <p style={{ margin: '8px 0 0' }}>{item.message}</p> : <p style={{ margin: '8px 0 0', color: '#8a8a8a' }}>No message</p>}
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
                {item.isResolved ? 'Reopen' : 'Mark resolved'}
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
