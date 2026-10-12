import { useEffect, useState } from 'react';
import { getUserMetrics, getUserMetricsUsers } from '../api/userMetrics';
import { ApiClientError } from '../api/client';
import type { UserMetrics, UserMetricsUser } from '../types';

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Tracking starts on this day; nothing earlier is shown. */
const FIRST_DAY = '2026-10-01';

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
    return n === 0 ? (
      <span className="um-zero">0</span>
    ) : (
      <button type="button" className="um-num" onClick={() => openUsers(date, kind)}>
        {nf.format(n)}
      </button>
    );
  }

  const days = metrics ? metrics.daily.filter((d) => d.date >= FIRST_DAY) : [];
  const today = days[0];

  return (
    <section className="um">
      <div className="um__bar">
        <p className="um__hint">
          Active = watched a lesson, placed an order or booked a Live class that day. Click a number to see who.
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
          <div className="um__cards">
            <div className="card card--stat">
              <span className="card__label">Total users</span>
              <span className="card__value">{nf.format(metrics.totalUsers)}</span>
              <span className="um__sub">{today ? `+${nf.format(today.newUsers)} today` : 'All registered accounts'}</span>
            </div>
            <div className="card card--stat">
              <span className="card__label">Offer class users</span>
              <span className="card__value">{nf.format(metrics.offerClassUsers)}</span>
              <span className="um__sub">Active founding members</span>
            </div>
            <div className="card card--stat">
              <span className="card__label">Other course users</span>
              <span className="card__value">{nf.format(metrics.otherCourseUsers)}</span>
              <span className="um__sub">Active, outside the offer</span>
            </div>
            <div className="card card--stat">
              <span className="card__label">Live class users</span>
              <span className="card__value">{nf.format(metrics.liveClassUsers)}</span>
              <span className="um__sub">Booked this week or later</span>
            </div>
            <div className="card card--stat">
              <span className="card__label">Active today</span>
              <span className="card__value">{nf.format(today?.activeUsers ?? 0)}</span>
              <span className="um__sub">So far today</span>
            </div>
          </div>

          <div className="um__panel">
            <div className="um__panel-head">
              <h2 className="um__panel-title">Daily breakdown</h2>
              <span className="um__panel-note">Since 1 Oct 2026</span>
            </div>
            <table className="um__table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>New users</th>
                  <th>Active users</th>
                  <th>Total users</th>
                </tr>
              </thead>
              <tbody>
                {days.map((d, n) => (
                  <tr key={d.date} className={n === 0 ? 'um__today' : undefined}>
                    <td>
                      {dayLabel(d.date)}
                      {n === 0 && <span className="um__pill">Today</span>}
                    </td>
                    <td>{count(d.date, 'new', d.newUsers)}</td>
                    <td>{count(d.date, 'active', d.activeUsers)}</td>
                    <td>{count(d.date, 'total', d.totalUsers)}</td>
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
