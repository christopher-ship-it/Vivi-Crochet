import { useEffect, useState } from 'react';
import { getUserMetrics } from '../api/userMetrics';
import { ApiClientError } from '../api/client';
import type { UserMetrics } from '../types';

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

  return (
    <section className="section-block dashboard-section">
      <div className="section-block__head">
        <div>
          <h2 className="section-title" style={{ marginBottom: 0 }}>Daily user metrics</h2>
          <p className="card__subtitle">
            Sign-ups, active users and paid users. Active = watched a lesson, placed an order or booked a Live class that day.
          </p>
        </div>
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
              <span className="card__label">Growth ({metrics.daily.length} days)</span>
              <span className="card__value">
                {metrics.growthPercent === null ? '—' : `${metrics.growthPercent > 0 ? '+' : ''}${metrics.growthPercent}%`}
              </span>
            </div>
          </div>

          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table className="data-table">
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
                    <td>{dayLabel(d.date)}</td>
                    <td style={{ textAlign: 'right' }}>{nf.format(d.newUsers)}</td>
                    <td style={{ textAlign: 'right' }}>{nf.format(d.activeUsers)}</td>
                    <td style={{ textAlign: 'right' }}>{nf.format(d.totalUsers)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
