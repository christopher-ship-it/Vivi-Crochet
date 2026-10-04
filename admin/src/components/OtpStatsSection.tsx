import { useEffect, useState } from 'react';
import { getOtpHistory, getOtpStats } from '../api/otpStats';
import { ApiClientError } from '../api/client';
import type { OtpHistory, OtpStats } from '../types';
import { downloadOtpExcel } from '../utils/exportOtpExcel';
import { formatDate } from '../utils/format';

function percent(part: number, whole: number): string {
  return whole === 0 ? '—' : `${Math.round((part / whole) * 100)}%`;
}

function dayLabel(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${day}/${month}`;
}

/** Sign-in OTPs the app has generated: totals, a 30-day chart, busiest numbers and the latest requests. */
export function OtpStatsSection() {
  const [stats, setStats] = useState<OtpStats | null>(null);
  const [history, setHistory] = useState<OtpHistory | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [result, all] = await Promise.all([getOtpStats(), getOtpHistory()]);
        if (!cancelled) {
          setStats(result);
          setHistory(all);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiClientError ? err.message : 'Could not load OTP numbers.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleExport() {
    if (!stats || !history) return;
    setExporting(true);
    setExportError(null);
    try {
      await downloadOtpExcel(stats, history);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Could not create the Excel file.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="section-block dashboard-section">
      <div className="section-block__head">
        <h2 className="section-title" style={{ marginBottom: 0 }}>Phone OTPs</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {stats?.firstRequestedAt && (
            <span className="form-hint">Tracked since {formatDate(stats.firstRequestedAt)}</span>
          )}
          <button
            type="button"
            className="btn"
            disabled={!stats || !history || exporting}
            onClick={() => void handleExport()}
          >
            {exporting ? 'Preparing…' : 'Download Excel'}
          </button>
        </div>
      </div>

      {loading && (
        <div className="loading-state">
          <p>Loading OTP numbers…</p>
        </div>
      )}

      {error && (
        <div className="error-state">
          <h3>Could not load OTP numbers</h3>
          <p>{error}</p>
        </div>
      )}

      {exportError && <div className="form-error">{exportError}</div>}

      {stats && (
        <>
          <div className="stat-grid">
            <div className="card card--stat">
              <span className="card__label">Today</span>
              <span className="card__value">{stats.today}</span>
              <span className="form-hint">{stats.verifiedToday} used to sign in</span>
            </div>
            <div className="card card--stat">
              <span className="card__label">Last 7 days</span>
              <span className="card__value">{stats.last7Days}</span>
              <span className="form-hint">{stats.verifiedLast7Days} used ({percent(stats.verifiedLast7Days, stats.last7Days)})</span>
            </div>
            <div className="card card--stat">
              <span className="card__label">Last 30 days</span>
              <span className="card__value">{stats.last30Days}</span>
              <span className="form-hint">
                {stats.verifiedLast30Days} used ({percent(stats.verifiedLast30Days, stats.last30Days)}) · {stats.uniquePhonesLast30Days} phones
              </span>
            </div>
            <div className="card card--stat">
              <span className="card__label">All time</span>
              <span className="card__value">{stats.totalAllTime}</span>
              <span className="form-hint">{stats.verifiedAllTime} used ({percent(stats.verifiedAllTime, stats.totalAllTime)})</span>
            </div>
          </div>

          <DailyChart days={stats.daily} />

          {history && <SummaryTables history={history} />}

          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Most OTPs, last 7 days</th>
                  <th>Requested</th>
                  <th>Used</th>
                </tr>
              </thead>
              <tbody>
                {stats.topPhonesLast7Days.length === 0 ? (
                  <tr><td colSpan={3}>No OTPs in the last 7 days.</td></tr>
                ) : (
                  stats.topPhonesLast7Days.map((p) => (
                    <tr key={p.phone}>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{p.phone}</td>
                      <td>{p.requests}</td>
                      <td>{p.verified}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Latest OTP requests</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Attempts</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent.length === 0 ? (
                  <tr><td colSpan={4}>No OTPs requested yet.</td></tr>
                ) : (
                  stats.recent.map((r, i) => (
                    <tr key={`${r.requestedAt}-${i}`}>
                      <td>{formatDate(r.requestedAt)}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{r.phone}</td>
                      <td>
                        <span className={`badge ${r.status === 'Verified' ? 'badge--published' : 'badge--inactive'}`}>
                          {r.status.toUpperCase()}
                        </span>
                      </td>
                      <td>{r.attempts}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function DailyChart({ days }: { days: OtpStats['daily'] }) {
  const max = Math.max(1, ...days.map((d) => d.requested));
  return (
    <div style={{ marginTop: 16 }}>
      <span className="form-hint">OTPs requested per day, last 30 days (darker = used to sign in)</span>
      <div
        role="img"
        aria-label="OTPs requested per day over the last 30 days"
        style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 120, marginTop: 8 }}
      >
        {days.map((d) => (
          <div
            key={d.date}
            title={`${dayLabel(d.date)}: ${d.requested} requested, ${d.verified} used`}
            style={{
              flex: 1,
              height: `${Math.max(2, (d.requested / max) * 100)}%`,
              minWidth: 4,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              borderRadius: 3,
              overflow: 'hidden',
              background: 'var(--vivi-pink-soft, #fbd3df)',
            }}
          >
            <div
              style={{
                height: d.requested === 0 ? 0 : `${(d.verified / d.requested) * 100}%`,
                background: 'var(--vivi-pink, #e8215b)',
              }}
            />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span className="form-hint">{dayLabel(days[0]?.date ?? '')}</span>
        <span className="form-hint">{dayLabel(days[days.length - 1]?.date ?? '')}</span>
      </div>
    </div>
  );
}

function monthTitle(month: string): string {
  const [year, m] = month.split('-').map(Number);
  return new Date(year, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

/** Month-wise totals (all months) and day-wise totals (last 30 days, newest first). */
function SummaryTables({ history }: { history: OtpHistory }) {
  const months = [...history.monthly].reverse();
  const days = [...history.daily].slice(-30).reverse();
  return (
    <>
      <div className="table-wrap" style={{ marginTop: 16 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Monthly summary</th>
              <th>Requested</th>
              <th>Used</th>
              <th>Used %</th>
              <th>Phones</th>
              <th>Days with OTPs</th>
            </tr>
          </thead>
          <tbody>
            {months.length === 0 ? (
              <tr><td colSpan={6}>No OTPs requested yet.</td></tr>
            ) : (
              months.map((m) => (
                <tr key={m.month}>
                  <td className="cell-strong">{monthTitle(m.month)}</td>
                  <td>{m.requested}</td>
                  <td>{m.verified}</td>
                  <td>{percent(m.verified, m.requested)}</td>
                  <td>{m.uniquePhones}</td>
                  <td>{m.activeDays}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="table-wrap" style={{ marginTop: 16 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Day-wise, last 30 days</th>
              <th>Requested</th>
              <th>Used</th>
              <th>Used %</th>
              <th>Phones</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.date}>
                <td>{d.date}</td>
                <td>{d.requested}</td>
                <td>{d.verified}</td>
                <td>{percent(d.verified, d.requested)}</td>
                <td>{d.uniquePhones}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
