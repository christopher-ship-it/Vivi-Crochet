import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiClientError } from '../api/client';
import { broadcastPush, getPushReach, sendWeeklyPushNow } from '../api/push';
import { confirmDialog } from '../components/AppDialog';

const SCREENS = [
  { value: '/(tabs)/shop', label: 'Shop' },
  { value: '/(tabs)/learn', label: 'Learn & Loop' },
  { value: '/(tabs)/live', label: 'Live classes' },
  { value: '/(tabs)/profile', label: 'Profile' },
  { value: '/(tabs)/index', label: 'Home' },
];

export function NotificationsPage() {
  const [devices, setDevices] = useState(0);
  const [customers, setCustomers] = useState(0);
  const [loadingReach, setLoadingReach] = useState(true);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [screen, setScreen] = useState('/(tabs)/shop');
  const [sending, setSending] = useState(false);
  const [weeklySending, setWeeklySending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const loadReach = useCallback(async () => {
    setLoadingReach(true);
    try {
      const reach = await getPushReach();
      setDevices(reach.activeDevices);
      setCustomers(reach.activeCustomers);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not load push reach.');
    } finally {
      setLoadingReach(false);
    }
  }, []);

  useEffect(() => {
    void loadReach();
  }, [loadReach]);

  async function handleBroadcast(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    setInfo(null);
    try {
      const result = await broadcastPush({ title, body, screen });
      setInfo(
        result.sentToDevices === 0
          ? 'No devices have registered for push yet.'
          : `Sent to ${result.sentToDevices} device${result.sentToDevices === 1 ? '' : 's'}.`,
      );
      setTitle('');
      setBody('');
      await loadReach();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not send notification.');
    } finally {
      setSending(false);
    }
  }

  async function handleWeekly() {
    if (
      !await confirmDialog(
        'Send the weekly product + course + live digests now to all eligible customers?',
      )
    ) {
      return;
    }
    setWeeklySending(true);
    setError(null);
    setInfo(null);
    try {
      const result = await sendWeeklyPushNow();
      setInfo(
        result.notified === 0
          ? 'No eligible customers (need active tokens and 7+ days since last weekly).'
          : `Weekly digests sent to ${result.notified} customer${result.notified === 1 ? '' : 's'}.`,
      );
      await loadReach();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not send weekly digests.');
    } finally {
      setWeeklySending(false);
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-header__title">Notifications</h1>
          <p className="page-header__subtitle">
            Send outside-app push notifications to customers who allowed alerts.
          </p>
        </div>
        <div className="page-header__actions">
          <button type="button" className="btn btn--sm" onClick={() => void loadReach()} disabled={loadingReach}>
            Refresh
          </button>
        </div>
      </header>

      {error ? (
        <div className="error-state">
          <p>{error}</p>
        </div>
      ) : null}
      {info ? (
        <div className="alert alert--info alert--spaced">
          <p>{info}</p>
        </div>
      ) : null}

      <section className="card">
        <h2 className="card__title" style={{ marginBottom: 6 }}>Reach</h2>
        <p className="card__subtitle">
          {loadingReach
            ? 'Loading…'
            : `${customers} customer${customers === 1 ? '' : 's'} · ${devices} active device${devices === 1 ? '' : 's'}`}
        </p>
      </section>

      <section className="card">
        <h2 className="card__title" style={{ marginBottom: 16 }}>Broadcast</h2>
        <form onSubmit={(e) => void handleBroadcast(e)} className="form-stack">
          <div className="form-field">
            <label htmlFor="push-title">Title</label>
            <input
              id="push-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              placeholder="Fresh from the VIVI studio"
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="push-body">Message</label>
            <textarea
              id="push-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={240}
              rows={3}
              placeholder="New handmade picks just for you. Open Shop to see what’s new."
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="push-screen">Opens in app</label>
            <select id="push-screen" value={screen} onChange={(e) => setScreen(e.target.value)}>
              {SCREENS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn--primary" disabled={sending || !title.trim() || !body.trim()}>
            {sending ? 'Sending…' : 'Send to all devices'}
          </button>
        </form>
      </section>

      <section className="card">
        <h2 className="card__title" style={{ marginBottom: 6 }}>Weekly digest</h2>
        <p className="card__subtitle" style={{ marginBottom: 16 }}>
          Sends the three weekly messages (product, course, live) to customers who have not received them in the last 7
          days.
        </p>
        <button type="button" className="btn" onClick={() => void handleWeekly()} disabled={weeklySending}>
          {weeklySending ? 'Sending…' : 'Send weekly digests now'}
        </button>
      </section>
    </>
  );
}
