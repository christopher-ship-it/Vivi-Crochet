import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiClientError } from '../api/client';
import { setLiveSlotHours, setLiveWeekOverrides } from '../api/live';
import type { AdminLiveWeek } from '../types';
import { formatInr } from '../utils/format';

type Props = {
  week: AdminLiveWeek;
  /** Called after a successful save so the parent can reload the weeks. */
  onSaved: () => Promise<void>;
};

function draftFrom(week: AdminLiveWeek) {
  return {
    price: week.priceOverride != null ? String(week.priceOverride) : '',
    language: week.languageOverride ?? '',
    level: week.levelOverride ?? '',
    hours: Object.fromEntries(week.slots.map((s) => [s.slotType, s.hoursOverride ?? ''])),
  };
}

/** Price, language, level and per-session timing for ONE week. Empty = use the studio value. */
export function LiveWeekOverrides({ week, onSaved }: Props) {
  const [draft, setDraft] = useState(() => draftFrom(week));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(draftFrom(week));
    setError(null);
    setSaved(false);
  }, [week]);

  const hasOverride =
    week.priceOverride != null ||
    Boolean(week.languageOverride) ||
    Boolean(week.levelOverride) ||
    week.slots.some((s) => Boolean(s.hoursOverride));

  async function save(next: ReturnType<typeof draftFrom>) {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const price = next.price.trim();
      const priceNumber = price === '' ? null : Number(price);
      if (priceNumber !== null && (!Number.isFinite(priceNumber) || priceNumber < 1)) {
        throw new Error('Price must be a number of at least ₹1.');
      }
      await setLiveWeekOverrides(week.id, {
        priceOverride: priceNumber,
        languageOverride: next.language.trim() || null,
        levelOverride: next.level.trim() || null,
      });
      for (const slot of week.slots) {
        const value = (next.hours[slot.slotType] ?? '').trim();
        if (value !== (slot.hoursOverride ?? '')) {
          await setLiveSlotHours(week.id, slot.slotType, value || null);
        }
      }
      await onSaved();
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof ApiClientError || err instanceof Error
          ? err.message
          : 'Could not save this week.',
      );
    } finally {
      setBusy(false);
    }
  }

  const cleared = {
    price: '',
    language: '',
    level: '',
    hours: Object.fromEntries(week.slots.map((s) => [s.slotType, ''])),
  };

  return (
    <details className="card" style={{ marginBottom: 12 }} open={hasOverride}>
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
        Week {week.weekNumber} price, timing, language and level
        {hasOverride ? <span className="badge badge--pending" style={{ marginLeft: 8 }}>Custom</span> : null}
      </summary>

      <p className="form-hint" style={{ margin: '8px 0 12px' }}>
        Leave a field empty to use the studio setting. Changes affect only this week and apply to
        new bookings. To add another session (for example a mid-day class) for every week,{' '}
        <Link to="/live/settings">switch it on in Live settings</Link>.
      </p>

      {error ? <div className="form-error">{error}</div> : null}
      {saved ? <div className="alert alert--success">Saved for this week.</div> : null}

      <div className="form-grid-6">
        <div className="form-field span-2">
          <label htmlFor={`wk-price-${week.id}`}>Price</label>
          <div className="input-affix">
            <span className="input-affix__prefix">₹</span>
            <input
              id={`wk-price-${week.id}`}
              type="number"
              min={1}
              placeholder={week.priceOverride == null ? String(week.packagePrice) : 'Studio price'}
              value={draft.price}
              onChange={(e) => setDraft({ ...draft, price: e.target.value })}
            />
          </div>
          <p className="form-hint">Customers pay {formatInr(week.packagePrice)} now.</p>
        </div>

        <div className="form-field span-2">
          <label htmlFor={`wk-lang-${week.id}`}>Language</label>
          <input
            id={`wk-lang-${week.id}`}
            maxLength={40}
            placeholder={week.languageOverride ? 'Studio language' : week.language}
            value={draft.language}
            onChange={(e) => setDraft({ ...draft, language: e.target.value })}
          />
        </div>

        <div className="form-field span-2">
          <label htmlFor={`wk-level-${week.id}`}>Level</label>
          <input
            id={`wk-level-${week.id}`}
            maxLength={40}
            placeholder={week.levelOverride ? 'Studio level' : week.level}
            value={draft.level}
            onChange={(e) => setDraft({ ...draft, level: e.target.value })}
          />
        </div>

        {week.slots.map((slot) => (
          <div key={slot.slotType} className="form-field span-3">
            <label htmlFor={`wk-hours-${week.id}-${slot.slotType}`}>{slot.name} timing</label>
            <input
              id={`wk-hours-${week.id}-${slot.slotType}`}
              maxLength={60}
              placeholder={slot.hoursOverride ? 'Default timing' : (slot.hours ?? '')}
              value={draft.hours[slot.slotType] ?? ''}
              onChange={(e) =>
                setDraft({ ...draft, hours: { ...draft.hours, [slot.slotType]: e.target.value } })
              }
            />
          </div>
        ))}
      </div>

      <div className="form-actions" style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={() => void save(draft)}>
          {busy ? 'Saving…' : 'Save for this week'}
        </button>
        {hasOverride ? (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={busy}
            onClick={() => void save(cleared)}
          >
            Use studio settings
          </button>
        ) : null}
      </div>
    </details>
  );
}
