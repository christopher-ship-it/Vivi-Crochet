import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ensureLiveSeason,
  listAdminLiveWeeks,
  setLiveSlotCapacity,
  setLiveWeekBookable,
  setLiveWeekBreak,
} from '../api/live';
import { ApiClientError } from '../api/client';
import type { AdminLiveWeek } from '../types';
import { formatInr } from '../utils/format';

const BREAK_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'Monday', label: 'Monday' },
  { value: 'Tuesday', label: 'Tuesday' },
  { value: 'Wednesday', label: 'Wednesday' },
  { value: 'Thursday', label: 'Thursday' },
  { value: 'Friday', label: 'Friday' },
];

export function LiveWeeksPage() {
  const [weeks, setWeeks] = useState<AdminLiveWeek[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ensuring, setEnsuring] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setWeeks(await listAdminLiveWeeks());
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load weeks.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleEnsureSeason() {
    setEnsuring(true);
    setError(null);
    try {
      await ensureLiveSeason();
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not ensure season.');
    } finally {
      setEnsuring(false);
    }
  }

  async function handleBreak(week: AdminLiveWeek, value: string) {
    setBusyId(week.id);
    setError(null);
    try {
      await setLiveWeekBreak(week.id, value || null);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not update break day.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleBookable(week: AdminLiveWeek) {
    setBusyId(week.id);
    setError(null);
    try {
      await setLiveWeekBookable(week.id, !week.isBookable);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not update bookable flag.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleCapacity(week: AdminLiveWeek, slotType: string, current: number) {
    const input = window.prompt(`New ${slotType} seat capacity`, String(current));
    if (input == null) return;
    const seatCapacity = Number.parseInt(input, 10);
    if (!Number.isFinite(seatCapacity)) {
      setError('Seat capacity must be a number.');
      return;
    }

    setBusyId(week.id);
    setError(null);
    try {
      await setLiveSlotCapacity(week.id, slotType, seatCapacity);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not update capacity.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-header__title">Live weeks</h1>
          <p className="page-header__subtitle">
            Season calendar, break days, bookable flag, and seat capacity.
          </p>
        </div>
        <div className="page-header__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void handleEnsureSeason()}
            disabled={ensuring}
          >
            {ensuring ? 'Ensuring…' : 'Ensure season'}
          </button>
          <Link to="/live" className="btn btn--ghost">
            Back to bookings
          </Link>
        </div>
      </header>

      {error && (
        <div className="form-error" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading && (
        <div className="loading-state">
          <p>Loading weeks…</p>
        </div>
      )}

      {!loading && weeks.length === 0 && (
        <div className="empty-state">
          <h3>No weeks yet</h3>
          <p>Click Ensure season to seed the 52-week Live Crochet Studio calendar.</p>
        </div>
      )}

      {!loading && weeks.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Week</th>
                <th>Dates</th>
                <th>Price</th>
                <th>Morning</th>
                <th>Evening</th>
                <th>Break</th>
                <th>Bookable</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {weeks.map((week) => {
                const morning = week.slots.find((s) => s.slotType === 'Morning');
                const evening = week.slots.find((s) => s.slotType === 'Evening');
                const busy = busyId === week.id;
                return (
                  <tr key={week.id}>
                    <td style={{ fontWeight: 600 }}>
                      W{week.weekNumber} · {week.seasonYear}
                    </td>
                    <td>
                      {week.startDate} → {week.endDate}
                    </td>
                    <td>{formatInr(week.packagePrice)}</td>
                    <td>
                      {morning
                        ? `${morning.seatsBooked}/${morning.seatCapacity}`
                        : '—'}
                    </td>
                    <td>
                      {evening
                        ? `${evening.seatsBooked}/${evening.seatCapacity}`
                        : '—'}
                    </td>
                    <td>
                      <select
                        value={week.breakWeekday ?? ''}
                        disabled={busy}
                        onChange={(e) => void handleBreak(week, e.target.value)}
                        aria-label={`Break day for week ${week.weekNumber}`}
                      >
                        {BREAK_OPTIONS.map((opt) => (
                          <option key={opt.value || 'none'} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <span className={`badge ${week.isBookable ? 'badge--published' : 'badge--inactive'}`}>
                        {week.isBookable ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td>
                      <div className="data-table__actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn--ghost"
                          disabled={busy}
                          onClick={() => void handleBookable(week)}
                        >
                          {week.isBookable ? 'Close booking' : 'Open booking'}
                        </button>
                        {morning && (
                          <button
                            type="button"
                            className="btn btn--ghost"
                            disabled={busy}
                            onClick={() => void handleCapacity(week, 'Morning', morning.seatCapacity)}
                          >
                            Morning seats
                          </button>
                        )}
                        {evening && (
                          <button
                            type="button"
                            className="btn btn--ghost"
                            disabled={busy}
                            onClick={() => void handleCapacity(week, 'Evening', evening.seatCapacity)}
                          >
                            Evening seats
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
