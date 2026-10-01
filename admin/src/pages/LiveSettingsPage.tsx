import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiClientError } from '../api/client';
import { getLiveSettings, updateLiveSettings } from '../api/live';
import type { AdminLiveSettings } from '../types';

const LANGUAGE_SUGGESTIONS = ['Tamil', 'English', 'Hindi', 'Tamil + English'];
const LEVEL_SUGGESTIONS = ['Basic', 'Intermediate', 'Advanced'];

function parseNumberDraft(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function LiveSettingsPage() {
  const [form, setForm] = useState<AdminLiveSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getLiveSettings()
      .then(setForm)
      .catch((err) =>
        setLoadError(err instanceof ApiClientError ? err.message : 'Failed to load Live settings.'),
      );
  }, []);

  function update(patch: Partial<AdminLiveSettings>) {
    setForm((cur) => (cur ? { ...cur, ...patch } : cur));
    setSaved(false);
  }

  function updateSession(index: number, patch: Partial<AdminLiveSettings['sessions'][number]>) {
    setForm((cur) =>
      cur
        ? { ...cur, sessions: cur.sessions.map((s, i) => (i === index ? { ...s, ...patch } : s)) }
        : cur,
    );
    setSaved(false);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      setForm(await updateLiveSettings(form));
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof ApiClientError ? err.message : 'Could not save Live settings.');
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div className="error-state">
        <h3>Could not load Live settings</h3>
        <p>{loadError}</p>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="loading-state">
        <p>Loading Live settings…</p>
      </div>
    );
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-header__title">Live settings</h1>
          <p className="page-header__subtitle">
            What customers see and pay for Live classes. You can still change the price, timing,
            language or level for one specific week from the Live classes calendar.
          </p>
        </div>
        <div className="page-header__actions">
          <Link to="/live" className="btn btn--sm">
            Back to Live classes
          </Link>
        </div>
      </header>

      <form className="card form-dense" onSubmit={handleSave}>
        {saveError && <div className="form-error">{saveError}</div>}
        {saved && <div className="alert alert--success">Live settings saved.</div>}

        <div className="form-grid-6">
          <div className="form-field span-2">
            <label htmlFor="livePrice">Price per package</label>
            <div className="input-affix">
              <span className="input-affix__prefix">₹</span>
              <input
                id="livePrice"
                type="number"
                min={1}
                max={100000}
                value={form.packagePrice}
                onChange={(e) => update({ packagePrice: parseNumberDraft(e.target.value) })}
              />
            </div>
            <p className="form-hint">Applies to new bookings. Existing bookings keep what they paid.</p>
          </div>

          <div className="form-field span-2">
            <label htmlFor="liveHours">Hours per class day</label>
            <input
              id="liveHours"
              type="number"
              min={1}
              max={8}
              value={form.hoursPerClassDay}
              onChange={(e) => update({ hoursPerClassDay: parseNumberDraft(e.target.value) })}
            />
            <p className="form-hint">Monday to Friday. Used for the weekly total shown to customers.</p>
          </div>

          <div className="form-field span-2" />

          <div className="form-field span-3">
            <label htmlFor="liveLanguage">Class language</label>
            <input
              id="liveLanguage"
              list="live-language-options"
              maxLength={40}
              value={form.language}
              onChange={(e) => update({ language: e.target.value })}
              required
            />
            <datalist id="live-language-options">
              {LANGUAGE_SUGGESTIONS.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </div>

          <div className="form-field span-3">
            <label htmlFor="liveLevel">Level</label>
            <input
              id="liveLevel"
              list="live-level-options"
              maxLength={40}
              value={form.level}
              onChange={(e) => update({ level: e.target.value })}
              required
            />
            <datalist id="live-level-options">
              {LEVEL_SUGGESTIONS.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </div>
        </div>

        <h2 className="card__title" style={{ marginTop: 28 }}>
          Sessions
        </h2>
        <p className="form-hint" style={{ marginBottom: 12 }}>
          Morning and Evening are always on. Switch on an additional session to give customers
          another time to choose from, such as a mid-day class. Bookings for a week close when
          the Monday Morning session starts, so keep a start time like “10:00 AM” in its timing.
        </p>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 90 }}>On</th>
                <th>Session name</th>
                <th>Timing</th>
              </tr>
            </thead>
            <tbody>
              {form.sessions.map((session, index) => (
                <tr key={session.slotType}>
                  <td>
                    {session.isCore ? (
                      <span className="badge badge--published">Always on</span>
                    ) : (
                      <input
                        type="checkbox"
                        aria-label={`Enable ${session.name}`}
                        checked={session.isEnabled}
                        onChange={(e) => updateSession(index, { isEnabled: e.target.checked })}
                      />
                    )}
                  </td>
                  <td>
                    <input
                      aria-label={`Name for ${session.slotType}`}
                      maxLength={100}
                      value={session.name}
                      disabled={!session.isCore && !session.isEnabled}
                      onChange={(e) => updateSession(index, { name: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Timing for ${session.slotType}`}
                      maxLength={60}
                      placeholder="10:00 AM – 12:00 PM"
                      value={session.hours}
                      disabled={!session.isCore && !session.isEnabled}
                      onChange={(e) => updateSession(index, { hours: e.target.value })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="form-actions" style={{ marginTop: 20 }}>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </form>
    </>
  );
}
