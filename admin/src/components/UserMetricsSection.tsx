import { useEffect, useState } from 'react';
import { getUserMetrics, getUserMetricsUsers } from '../api/userMetrics';
import { ApiClientError } from '../api/client';
import type { UserMetrics, UserMetricsUser } from '../types';

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const nf = new Intl.NumberFormat('en-IN');

function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Daily sign-ups and active users, plus how many customers hold each kind of paid access. */
export function UserMetricsSection() {
  const [metrics, setMetrics] = useState<UserMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setMetrics(await getUserMetrics());
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load user metrics.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const [picked, setPicked] = useState<{ date: string; kind: 'new' | 'active' | 'total' } | null>(null);
  const [users, setUsers] = useState<UserMetricsUser[] | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);

  function openUsers(date: string, kind: 'new' | 'active' | 'total') {
    setPicked({ date, kind });
    setUsers(null);
    setUsersError(null);
    getUserMetricsUsers(date, kind)
      .then(setUsers)
      .catch((err) => setUsersError(err instanceof ApiClientError ? err.message : 'Failed to load users.'));
  }

  const KIND_LABEL = { new: 'New users', active: 'Active users', total: 'Total users' } as const;

  function count(date: string, kind: 'new' | 'active' | 'total', n: number) {
    return n === 0 ? '0' : (
      <button type="button" className="cell-link" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
        onClick={() => openUsers(date, kind)}>
        {nf.format(n)}
      </button>
    );
  }

  return (
    <section className="section-block dashboard-section">
      <div className="section-block__head">
        <p className="card__subtitle">
          Active = watched a lesson, placed an order or booked a Live class that day.
        </p>
        <button type="button" className="btn btn--ghost btn--sm" disabled={loading} onClick={() => void load()}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="error-state">
          <p>{error}</p>
        </div>
      )}

      {metrics && (
        <>
          <div className="stat-grid">
            <div className="card card--stat">
              <span className="card__label">Total users</span>
              <span className="card__value">{nf.format(metrics.totalUsers)}</span>
            </div>
            <div className="card card--stat">
              <span className="card__label">Offer class users</span>
              <span className="card__value">{nf.format(metrics.offerClassUsers)}</span>
            </div>
            <div className="card card--stat">
              <span className="card__label">Other course users</span>
              <span className="card__value">{nf.format(metrics.otherCourseUsers)}</span>
            </div>
            <div className="card card--stat">
              <span className="card__label">Live class users</span>
              <span className="card__value">{nf.format(metrics.liveClassUsers)}</span>
            </div>
            <div className="card card--stat">
              <span className="card__label">Growth since 1 Oct</span>
              <span className="card__value">
                {metrics.growthPercent === null ? '—' : `${metrics.growthPercent > 0 ? '+' : ''}${metrics.growthPercent}%`}
              </span>
            </div>
          </div>

          <div className="table-wrap" style={{ marginTop: 16, width: 'fit-content' }}>
            <table className="data-table data-table--compact">
              <thead>
                <tr>
                  <th>Date</th>
                  <th style={{ textAlign: 'right' }}>New users</th>
                  <th style={{ textAlign: 'right' }}>Active users</th>
                  <th style={{ textAlign: 'right' }}>Total users</th>
                </tr>
              </thead>
              <tbody>
                {metrics.daily.map((d) => (
                  <tr key={d.date}>
                    <td style={{ whiteSpace: 'nowrap' }}>{dayLabel(d.date)}</td>
                    <td style={{ textAlign: 'right' }}>{count(d.date, 'new', d.newUsers)}</td>
                    <td style={{ textAlign: 'right' }}>{count(d.date, 'active', d.activeUsers)}</td>
                    <td style={{ textAlign: 'right' }}>{count(d.date, 'total', d.totalUsers)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {picked && (
        <div className="modal-backdrop" role="presentation" onClick={() => setPicked(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={KIND_LABEL[picked.kind]}
            style={{ maxWidth: users && users.length > 14 ? 900 : 560 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal__header">
              <h2 className="modal__title">
                {KIND_LABEL[picked.kind]} · {dayLabel(picked.date)}{users ? ` (${users.length})` : ''}
              </h2>
            </div>
            {usersError && <p>{usersError}</p>}
            {!users && !usersError && <p>Loading…</p>}
            {users && (
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                {/* Long lists are split side by side so the dialog stays short enough not to scroll. */}
                {chunk(users, users.length > 14 ? Math.ceil(users.length / 2) : Math.max(users.length, 1)).map((part, n) => (
                  <div key={n} className="table-wrap" style={{ flex: '1 1 0', minWidth: 0 }}>
                    <table className="data-table data-table--compact" style={{ width: '100%' }}>
                      <thead>
                        <tr><th>Name</th><th>Email / phone</th></tr>
                      </thead>
                      <tbody>
                        {part.map((u, i) => (
                          <tr key={`${u.email}${u.phone}-${i}`}>
                            <td>{u.name || '—'}</td>
                            <td>{u.email || u.phone || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
            <div className="modal__footer">
              <button type="button" className="btn btn--secondary" onClick={() => setPicked(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
