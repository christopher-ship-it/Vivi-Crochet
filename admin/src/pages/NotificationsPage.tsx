import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiClientError } from '../api/client';
import {
  broadcastPush,
  completePushImageUpload,
  getPushReach,
  requestPushImageUploadUrl,
  sendWeeklyPushNow,
} from '../api/push';
import { confirmDialog } from '../components/AppDialog';
import { listAdminCustomers } from '../api/customers';
import { uploadToBlob } from '../utils/videoUpload';

const PICTURE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

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
  const [audience, setAudience] = useState<'all' | 'one'>('all');
  const [customerQuery, setCustomerQuery] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const [uploading, setUploading] = useState(false);
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

  async function handlePickPicture(file: File | undefined) {
    if (!file) return;
    if (!PICTURE_TYPES.includes(file.type)) {
      setError('Use a JPG, PNG or WebP picture.');
      return;
    }
    setUploading(true);
    setError(null);
    setInfo(null);
    try {
      const ticket = await requestPushImageUploadUrl({
        fileName: file.name,
        contentType: file.type,
        fileSizeBytes: file.size,
      });
      await uploadToBlob(ticket.uploadUrl, file, file.type);
      const done = await completePushImageUpload({
        blobPath: ticket.blobPath,
        fileSizeBytes: file.size,
        contentType: file.type,
      });
      setImageUrl(done.imageUrl);
      setImagePreview(URL.createObjectURL(file));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not upload the picture.');
    } finally {
      setUploading(false);
    }
  }

  function removePicture() {
    setImageUrl('');
    setImagePreview('');
  }

  async function handleBroadcast(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    setInfo(null);
    try {
      let customerId: string | undefined;
      if (audience === 'one') {
        // Match the exact email or phone typed; this keeps a test from going to the wrong person.
        const q = customerQuery.trim();
        const digits = q.replace(/\D/g, '');
        const matches = await listAdminCustomers(q);
        const customer = matches.find(
          (c) =>
            c.email.toLowerCase() === q.toLowerCase() ||
            (digits.length >= 8 && (c.phoneNumber ?? '').replace(/\D/g, '').endsWith(digits)),
        );
        if (!customer) {
          setError('No customer found with that email or phone.');
          return;
        }
        customerId = customer.id;
      }
      const result = await broadcastPush({ title, body, screen, imageUrl: imageUrl || undefined, customerId });
      removePicture();
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
          <div className="form-field">
            <label htmlFor="push-picture">Picture (optional)</label>
            {imagePreview ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <img
                  src={imagePreview}
                  alt="Notification picture"
                  style={{ width: 160, height: 90, objectFit: 'cover', borderRadius: 10 }}
                />
                <button type="button" className="btn btn--sm" onClick={removePicture}>
                  Remove picture
                </button>
              </div>
            ) : (
              <input
                id="push-picture"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploading}
                onChange={(e) => void handlePickPicture(e.target.files?.[0])}
              />
            )}
            {uploading ? <p className="form-hint">Uploading picture…</p> : null}
          </div>
          <div className="form-field">
            <label htmlFor="push-audience">Send to</label>
            <select id="push-audience" value={audience} onChange={(e) => setAudience(e.target.value as 'all' | 'one')}>
              <option value="all">All devices</option>
              <option value="one">One customer (test)</option>
            </select>
          </div>
          {audience === 'one' ? (
            <div className="form-field">
              <label htmlFor="push-customer">Customer email or phone</label>
              <input
                id="push-customer"
                value={customerQuery}
                onChange={(e) => setCustomerQuery(e.target.value)}
                placeholder="name@example.com or 9876543210"
                required
              />
            </div>
          ) : null}
          <button
            type="submit"
            className="btn btn--primary"
            disabled={sending || uploading || !title.trim() || !body.trim() || (audience === 'one' && !customerQuery.trim())}
          >
            {sending ? 'Sending…' : audience === 'one' ? 'Send to this customer' : 'Send to all devices'}
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
