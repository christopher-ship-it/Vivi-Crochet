import { useCallback, useEffect, useState } from 'react';
import { ApiClientError } from '../api/client';
import {
  getAppHealthSummary,
  getHeatmap,
  listAppIssues,
  listHeatmapScreens,
  resetHeatmap,
  setAppIssueResolved,
  type AppHealthSummary,
  type AppIssue,
  type AppIssueKind,
  type Heatmap,
  type HeatmapScreen,
} from '../api/appHealth';
import { confirmDialog } from '../components/AppDialog';
import { formatDate } from '../utils/format';

type Tab = 'Crash' | 'Bug' | 'Buffering' | 'Heatmap';
type StatusFilter = 'open' | 'resolved' | 'all';

const TABS: { id: Tab; label: string }[] = [
  { id: 'Crash', label: 'Crashes' },
  { id: 'Bug', label: 'Bugs' },
  { id: 'Buffering', label: 'Video buffering' },
  { id: 'Heatmap', label: 'Heatmap' },
];

function errMessage(err: unknown, fallback: string): string {
  return err instanceof ApiClientError ? err.message : fallback;
}

export function AppHealthPage() {
  const [tab, setTab] = useState<Tab>('Crash');
  const [summary, setSummary] = useState<AppHealthSummary | null>(null);

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await getAppHealthSummary());
    } catch {
      // Summary cards are optional; the tab content shows its own errors.
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-header__title">App health</h1>
          <p className="page-header__subtitle">
            Crashes, bugs and where customers tap in the mobile app.
          </p>
        </div>
      </header>

      {summary && (
        <div className="stat-grid">
          <div className="card card--stat">
            <span className="card__label">Open crashes</span>
            <span className="card__value">{summary.openCrashes}</span>
          </div>
          <div className="card card--stat">
            <span className="card__label">Open bugs</span>
            <span className="card__value">{summary.openBugs}</span>
          </div>
          <div className="card card--stat">
            <span className="card__label">Crashes · last 7 days</span>
            <span className="card__value">{summary.crashesLast7Days}</span>
          </div>
          <div className="card card--stat">
            <span className="card__label">Bugs · last 7 days</span>
            <span className="card__value">{summary.bugsLast7Days}</span>
          </div>
          <div className="card card--stat">
            <span className="card__label">Video buffering &gt;5s · last 7 days</span>
            <span className="card__value">{summary.bufferingLast7Days}</span>
          </div>
        </div>
      )}

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`tab${tab === t.id ? ' tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'Heatmap' ? (
        <HeatmapPanel />
      ) : (
        <IssuesPanel key={tab} kind={tab} onChanged={() => void loadSummary()} />
      )}
    </>
  );
}

function IssuesPanel({ kind, onChanged }: { kind: AppIssueKind; onChanged: () => void }) {
  const [items, setItems] = useState<AppIssue[]>([]);
  const [status, setStatus] = useState<StatusFilter>('open');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listAppIssues(kind, status === 'all' ? undefined : status));
    } catch (err) {
      setError(errMessage(err, 'Failed to load reports.'));
    } finally {
      setLoading(false);
    }
  }, [kind, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleResolved(item: AppIssue) {
    setBusyId(item.id);
    try {
      await setAppIssueResolved(item.id, !item.isResolved);
      await load();
      onChanged();
    } catch (err) {
      setError(errMessage(err, 'Could not update the report.'));
    } finally {
      setBusyId(null);
    }
  }

  const noun = kind === 'Crash' ? 'crash' : kind === 'Bug' ? 'bug' : 'buffering';
  const heading = kind === 'Crash' ? 'Crash' : kind === 'Bug' ? 'Bug' : 'Video';

  return (
    <>
      <div className="filter-bar">
        <div className="tabs" style={{ marginBottom: 0 }}>
          {(['open', 'resolved', 'all'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              className={`tab${status === s ? ' tab--active' : ''}`}
              onClick={() => setStatus(s)}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn--sm" onClick={() => void load()} disabled={loading}>
          Refresh
        </button>
      </div>

      {loading && (
        <div className="loading-state">
          <p>Loading {noun} reports…</p>
        </div>
      )}

      {error && (
        <div className="error-state">
          <h3>Something went wrong</h3>
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="empty-state">
          <h3>No {noun} reports</h3>
          <p>
            {status === 'open'
              ? `No open ${noun}s. Nice.`
              : kind === 'Buffering'
                ? 'Nothing here yet. Videos that buffer for more than 5 seconds will show up here.'
                : `Nothing here yet. ${kind === 'Crash' ? 'Crashes' : 'Bugs'} reported by the app will show up here.`}
          </p>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{heading}</th>
                <th>Screen</th>
                <th>App / device</th>
                <th>Customer</th>
                <th>When</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <IssueRow
                  key={item.id}
                  item={item}
                  open={expanded === item.id}
                  busy={busyId === item.id}
                  onToggleOpen={() => setExpanded(expanded === item.id ? null : item.id)}
                  onToggleResolved={() => void toggleResolved(item)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function IssueRow({
  item,
  open,
  busy,
  onToggleOpen,
  onToggleResolved,
}: {
  item: AppIssue;
  open: boolean;
  busy: boolean;
  onToggleOpen: () => void;
  onToggleResolved: () => void;
}) {
  const muted = { color: 'var(--muted, #7a6d72)', fontSize: 13 } as const;
  return (
    <>
      <tr>
        <td style={{ maxWidth: 360 }}>
          <div style={{ fontWeight: 600 }}>{item.title}</div>
          {item.isFatal && <span className="badge badge--failed">Fatal</span>}
        </td>
        <td>{item.screen || '—'}</td>
        <td>
          <div>{item.appVersion ? `v${item.appVersion}` : '—'}</div>
          <div style={muted}>{[item.platform, item.deviceInfo].filter(Boolean).join(' · ')}</div>
        </td>
        <td>
          <div>{item.customerName || 'Guest'}</div>
          <div style={muted}>{item.phoneNumber}</div>
        </td>
        <td>{formatDate(item.createdAt)}</td>
        <td>
          <span className={`badge ${item.isResolved ? 'badge--published' : 'badge--pending'}`}>
            {item.isResolved ? 'Resolved' : 'Open'}
          </span>
        </td>
        <td style={{ whiteSpace: 'nowrap' }}>
          {item.details && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={onToggleOpen}>
              {open ? 'Hide details' : 'Details'}
            </button>
          )}{' '}
          <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={onToggleResolved}>
            {busy ? 'Saving…' : item.isResolved ? 'Reopen' : 'Mark resolved'}
          </button>
        </td>
      </tr>
      {open && item.details && (
        <tr>
          <td colSpan={7}>
            <pre
              style={{
                margin: 0,
                maxHeight: 280,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                fontSize: 12.5,
              }}
            >
              {item.details}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}

function HeatmapPanel() {
  const [screens, setScreens] = useState<HeatmapScreen[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [heatmap, setHeatmap] = useState<Heatmap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadScreens = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listHeatmapScreens();
      setScreens(list);
      setSelected((cur) => (cur && list.some((s) => s.screen === cur) ? cur : (list[0]?.screen ?? null)));
    } catch (err) {
      setError(errMessage(err, 'Failed to load heatmap screens.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadScreens();
  }, [loadScreens]);

  useEffect(() => {
    if (!selected) {
      setHeatmap(null);
      return;
    }
    let cancelled = false;
    getHeatmap(selected)
      .then((h) => {
        if (!cancelled) setHeatmap(h);
      })
      .catch((err) => {
        if (!cancelled) setError(errMessage(err, 'Failed to load heatmap.'));
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  async function handleReset() {
    if (!selected) return;
    const ok = await confirmDialog(`Clear all tap data for "${selected}"?`, {
      danger: true,
      confirmLabel: 'Clear data',
    });
    if (!ok) return;
    try {
      await resetHeatmap(selected);
      await loadScreens();
    } catch (err) {
      setError(errMessage(err, 'Could not clear heatmap.'));
    }
  }

  if (loading) {
    return (
      <div className="loading-state">
        <p>Loading heatmap…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-state">
        <h3>Could not load heatmap</h3>
        <p>{error}</p>
      </div>
    );
  }

  if (screens.length === 0) {
    return (
      <div className="empty-state">
        <h3>No tap data yet</h3>
        <p>As customers use the app, taps are grouped by screen and shown here.</p>
      </div>
    );
  }

  const cellMap = new Map<string, number>();
  heatmap?.cells.forEach((c) => cellMap.set(`${c.col}:${c.row}`, c.taps));
  const cols = heatmap?.columns ?? 10;
  const rows = heatmap?.rows ?? 20;
  const max = heatmap?.maxCellTaps ?? 0;

  return (
    <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div className="card" style={{ minWidth: 240 }}>
        <div className="card__header">
          <h3 className="card__title">Screens</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {screens.map((s) => (
            <button
              key={s.screen}
              type="button"
              className={`tab${selected === s.screen ? ' tab--active' : ''}`}
              style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between', gap: 16 }}
              onClick={() => setSelected(s.screen)}
            >
              <span>{s.screen}</span>
              <span style={{ opacity: 0.7 }}>{s.taps.toLocaleString()}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
          <strong>{selected}</strong>
          <span style={{ color: 'var(--muted, #7a6d72)', fontSize: 13 }}>
            {heatmap?.totalTaps.toLocaleString() ?? 0} taps
          </span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void handleReset()}>
            Clear data
          </button>
        </div>
        {/* Phone-shaped grid: each cell is a slice of the screen, shaded by tap share. */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            width: 280,
            gridTemplateRows: `repeat(${rows}, 1fr)`,
            height: 560,
            border: '2px solid var(--vivi-ink, #221a1e)',
            borderRadius: 24,
            overflow: 'hidden',
            background: '#fff',
          }}
        >
          {Array.from({ length: rows * cols }, (_, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const taps = cellMap.get(`${col}:${row}`) ?? 0;
            const intensity = max > 0 ? taps / max : 0;
            return (
              <div
                key={i}
                title={taps > 0 ? `${taps.toLocaleString()} taps` : undefined}
                style={{
                  background: intensity > 0 ? `rgba(232, 33, 91, ${0.12 + intensity * 0.78})` : 'transparent',
                  borderRight: '1px solid rgba(0,0,0,0.04)',
                  borderBottom: '1px solid rgba(0,0,0,0.04)',
                }}
              />
            );
          })}
        </div>
        <p style={{ color: 'var(--muted, #7a6d72)', fontSize: 13, marginTop: 8 }}>
          Darker = more taps. Grid is {cols}×{rows} across the screen.
        </p>
      </div>
    </div>
  );
}
