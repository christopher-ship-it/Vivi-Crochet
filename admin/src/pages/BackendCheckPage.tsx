import { useCallback, useEffect, useState } from 'react';
import { ApiClientError } from '../api/client';
import { getBackendCheck, type BackendCheck, type RouteStats } from '../api/backendCheck';
import { formatDate } from '../utils/format';

function ms(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${Math.round(value)} ms`;
}

function uptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

type Level = 'ok' | 'watch' | 'problem';

interface CheckRow {
  name: string;
  value: string;
  target: string;
  level: Level;
}

const LEVEL_BADGE: Record<Level, { cls: string; label: string }> = {
  ok: { cls: 'badge--published', label: 'OK' },
  watch: { cls: 'badge--pending', label: 'Watch' },
  problem: { cls: 'badge--failed', label: 'Problem' },
};

/** Ranges the owner should keep an eye on; tune here if traffic or the hosting plan changes. */
function buildChecklist(data: BackendCheck): CheckRow[] {
  const graded = (value: number, okMax: number, watchMax: number): Level =>
    value <= okMax ? 'ok' : value <= watchMax ? 'watch' : 'problem';
  const probe = (name: string, okMs: number, watchMs: number): CheckRow => {
    const c = data.checks.find((x) => x.name === name);
    if (!c) return { name, value: 'not reported', target: `under ${okMs} ms`, level: 'watch' };
    return {
      name,
      value: c.ok ? ms(c.ms) : `Failing${c.error ? ` (${c.error})` : ''}`,
      target: `under ${okMs} ms`,
      level: c.ok ? graded(c.ms, okMs, watchMs) : 'problem',
    };
  };

  // OPTIONS are browser preflights and backend-check runs live probes, so neither says anything about the API; endpoints with few requests are too noisy to judge.
  const judged = data.routes.filter((r) => r.count >= 5 && !r.route.startsWith('OPTIONS') && !r.route.endsWith('/api/admin/backend-check'));
  const worst = [...judged].sort((a, b) => b.p95Ms - a.p95Ms)[0];
  const clientShare = data.totalRequests > 0 ? data.clientErrors / data.totalRequests : 0;

  return [
    probe('Database', 300, 1000),
    probe('Blob storage', 200, 1000),
    {
      name: 'Server errors (5xx)',
      value: String(data.serverErrors),
      target: '0',
      level: data.serverErrors === 0 ? 'ok' : 'problem',
    },
    {
      name: 'Client errors (4xx)',
      value: `${data.clientErrors} (${Math.round(clientShare * 100)}%)`,
      target: 'under 5% of requests',
      level: data.clientErrors < 10 || clientShare <= 0.05 ? 'ok' : 'watch',
    },
    {
      name: 'Slowest endpoint (slowest 5%)',
      value: worst ? `${ms(worst.p95Ms)} · ${worst.route}` : 'Not enough requests yet',
      target: 'under 1 s',
      level: worst ? graded(worst.p95Ms, 1000, 2000) : 'ok',
    },
    {
      name: 'Up for',
      value: uptime(data.uptimeSeconds),
      target: 'not restarting',
      level: data.uptimeSeconds < 600 ? 'watch' : 'ok',
    },
    {
      name: 'Memory',
      value: `${data.memoryMb} MB`,
      target: 'under 400 MB',
      level: graded(data.memoryMb, 400, 800),
    },
    {
      name: 'Queued work',
      value: String(data.threadPoolQueued),
      target: '0',
      level: graded(data.threadPoolQueued, 0, 10),
    },
  ];
}

function Checklist({ data }: { data: BackendCheck }) {
  const rows = buildChecklist(data);
  const needsAttention = rows.filter((r) => r.level !== 'ok').length;
  return (
    <details className="collapsible">
      <summary>
        <h2>Checklist</h2>
        <span className={`badge ${needsAttention === 0 ? 'badge--published' : 'badge--pending'}`}>
          {needsAttention === 0 ? 'All within range' : `${needsAttention} to look at`}
        </span>
      </summary>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Check</th>
              <th>Now</th>
              <th>Target</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td>
                  <span className={`badge ${LEVEL_BADGE[r.level].cls}`}>{LEVEL_BADGE[r.level].label}</span>
                </td>
                <td>{r.name}</td>
                <td>{r.value}</td>
                <td>{r.target}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function RouteTable({ title, rows, empty }: { title: string; rows: RouteStats[]; empty: string }) {
  return (
    <section>
      <h2>{title}</h2>
      {rows.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>Requests</th>
                <th>4xx</th>
                <th>5xx</th>
                <th>Avg</th>
                <th>Slowest 5%</th>
                <th>Max</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.route}>
                  <td>{r.route}</td>
                  <td>{r.count}</td>
                  <td>{r.clientErrors}</td>
                  <td>{r.serverErrors}</td>
                  <td>{ms(r.avgMs)}</td>
                  <td>{ms(r.p95Ms)}</td>
                  <td>{ms(r.maxMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function BackendCheckPage() {
  const [data, setData] = useState<BackendCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getBackendCheck());
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not load the backend check.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const slowest = [...(data?.routes ?? [])].filter((r) => r.count >= 3).sort((a, b) => b.p95Ms - a.p95Ms).slice(0, 10);
  const failing = [...(data?.routes ?? [])].filter((r) => r.serverErrors + r.clientErrors > 0)
    .sort((a, b) => b.serverErrors - a.serverErrors || b.clientErrors - a.clientErrors).slice(0, 10);

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-header__title">Backend check</h1>
          <p className="page-header__subtitle">
            Live checks and request statistics since the API last started. Covers this server only; the Azure
            portal has history, database load and CPU.
          </p>
        </div>
        <button type="button" className="btn btn--sm" onClick={() => void load()} disabled={loading}>
          {loading ? 'Checking…' : 'Refresh'}
        </button>
      </header>

      {error && (
        <div className="error-state">
          <p>{error}</p>
        </div>
      )}

      {data && (
        <>
          <Checklist data={data} />

          <div className="stat-grid">
            {data.checks.map((c) => (
              <div className="card card--stat" key={c.name}>
                <span className="card__label">{c.name}</span>
                <span className="card__value">{c.ok ? `OK · ${ms(c.ms)}` : `Failing${c.error ? ` · ${c.error}` : ''}`}</span>
              </div>
            ))}
            <div className="card card--stat">
              <span className="card__label">Requests</span>
              <span className="card__value">{data.totalRequests}</span>
            </div>
            <div className="card card--stat">
              <span className="card__label">Server errors (5xx)</span>
              <span className="card__value">{data.serverErrors}</span>
            </div>
            <div className="card card--stat">
              <span className="card__label">Client errors (4xx)</span>
              <span className="card__value">{data.clientErrors}</span>
            </div>
            <div className="card card--stat">
              <span className="card__label">Up for</span>
              <span className="card__value">{uptime(data.uptimeSeconds)}</span>
            </div>
            <div className="card card--stat">
              <span className="card__label">Memory</span>
              <span className="card__value">{data.memoryMb} MB</span>
            </div>
            <div className="card card--stat">
              <span className="card__label">Queued work</span>
              <span className="card__value">{data.threadPoolQueued}</span>
            </div>
          </div>

          <RouteTable title="Slowest endpoints" rows={slowest} empty="Not enough requests yet." />
          <RouteTable title="Endpoints with errors" rows={failing} empty="No errors since start." />

          <section>
            <h2>Recent server errors</h2>
            {data.recentServerErrors.length === 0 ? (
              <p className="muted">None since start.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Endpoint</th>
                      <th>Status</th>
                      <th>Error type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentServerErrors.map((e) => (
                      <tr key={`${e.at}-${e.route}`}>
                        <td>{formatDate(e.at)}</td>
                        <td>{e.route}</td>
                        <td>{e.status}</td>
                        <td>{e.exceptionType ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
