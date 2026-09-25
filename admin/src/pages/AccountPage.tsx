import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { updateAdminProfile } from '../api/team';
import { ApiClientError } from '../api/client';
import { useAuth } from '../auth/AuthContext';

export function AccountPage() {
  const { user, updateUser, isFullAdmin } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const next = name.trim();
    if (next.length < 2) {
      setError('Enter a name with at least 2 characters.');
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await updateAdminProfile(next);
      updateUser(updated);
      setName(updated.name);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not update your name.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-header__title">Account</h1>
          <p className="page-header__subtitle">
            Update how your name appears in the admin console.
          </p>
        </div>
      </header>

      <section className="card card--xs">
        <form className="form-stack" onSubmit={(e) => void handleSubmit(e)}>
          {error ? <div className="form-error">{error}</div> : null}
          {saved ? (
            <div className="alert alert--success">
              Name updated.
            </div>
          ) : null}

          <div className="form-field">
            <label htmlFor="account-email">Email</label>
            <input id="account-email" value={user?.email ?? ''} disabled />
          </div>

          <div className="form-field">
            <label htmlFor="account-name">Display name</label>
            <input
              id="account-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSaved(false);
              }}
              maxLength={120}
              autoComplete="name"
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="account-role">Access</label>
            <input
              id="account-role"
              value={user?.role === 'Admin' ? 'Admin · full access' : 'Staff · day-to-day access'}
              disabled
            />
          </div>

          <div className="form-actions form-actions--flush">
            <button type="submit" className="btn" disabled={saving}>
              {saving ? 'Saving…' : 'Save name'}
            </button>
            {isFullAdmin ? (
              <Link to="/team" className="btn btn--ghost">
                Manage team users
              </Link>
            ) : null}
          </div>
        </form>
      </section>
    </>
  );
}
