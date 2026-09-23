import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import {
  createTeamUser,
  listTeamUsers,
  updateTeamUser,
  type AdminTeamUser,
} from '../api/team';
import { ApiClientError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { formatDate } from '../utils/format';

type ConsoleRole = 'Admin' | 'Staff';

export function TeamUsersPage() {
  const { user, isFullAdmin } = useAuth();
  const [users, setUsers] = useState<AdminTeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createRole, setCreateRole] = useState<ConsoleRole>('Staff');
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<ConsoleRole>('Staff');
  const [editActive, setEditActive] = useState(true);
  const [editPassword, setEditPassword] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isFullAdmin) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await listTeamUsers();
        if (!cancelled) setUsers(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Failed to load team users.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [isFullAdmin]);

  if (!isFullAdmin) {
    return <Navigate to="/account" replace />;
  }

  function beginEdit(row: AdminTeamUser) {
    setEditingId(row.id);
    setEditName(row.name);
    setEditRole(row.role === 'Admin' ? 'Admin' : 'Staff');
    setEditActive(row.isActive);
    setEditPassword('');
    setInfo(null);
    setError(null);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setInfo(null);
    try {
      const created = await createTeamUser({
        name: createName.trim(),
        email: createEmail.trim(),
        password: createPassword,
        role: createRole,
      });
      setUsers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setCreateName('');
      setCreateEmail('');
      setCreatePassword('');
      setCreateRole('Staff');
      setInfo(`Created ${created.name} (${created.role}).`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not create user.');
    } finally {
      setCreating(false);
    }
  }

  async function handleSave(id: string) {
    setSavingId(id);
    setError(null);
    setInfo(null);
    try {
      const updated = await updateTeamUser(id, {
        name: editName.trim(),
        role: editRole,
        isActive: editActive,
        newPassword: editPassword.trim() || undefined,
      });
      setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
      setEditingId(null);
      setEditPassword('');
      setInfo(`Updated ${updated.name}.`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not update user.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-header__title">Team users</h1>
          <p className="page-header__subtitle">
            Invite admins (full access) and staff (day-to-day console access).
          </p>
        </div>
      </header>

      {error ? <div className="form-error" style={{ marginBottom: 16 }}>{error}</div> : null}
      {info ? (
        <div
          className="form-error"
          style={{ marginBottom: 16, background: '#e8f6ee', color: '#1a7a4a', borderColor: '#b7dfc6' }}
        >
          {info}
        </div>
      ) : null}

      <section className="card" style={{ marginBottom: 24, maxWidth: 640 }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16 }}>Add user</h2>
        <form className="form-stack" onSubmit={(e) => void handleCreate(e)}>
          <div className="form-field">
            <label htmlFor="create-name">Name</label>
            <input
              id="create-name"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              required
              maxLength={120}
            />
          </div>
          <div className="form-field">
            <label htmlFor="create-email">Email</label>
            <input
              id="create-email"
              type="email"
              value={createEmail}
              onChange={(e) => setCreateEmail(e.target.value)}
              required
              maxLength={256}
            />
          </div>
          <div className="form-field">
            <label htmlFor="create-password">Temporary password</label>
            <input
              id="create-password"
              type="password"
              value={createPassword}
              onChange={(e) => setCreatePassword(e.target.value)}
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
            />
          </div>
          <div className="form-field">
            <label htmlFor="create-role">Access</label>
            <select
              id="create-role"
              value={createRole}
              onChange={(e) => setCreateRole(e.target.value as ConsoleRole)}
            >
              <option value="Staff">Staff · day-to-day access</option>
              <option value="Admin">Admin · full access</option>
            </select>
          </div>
          <button type="submit" className="btn" disabled={creating}>
            {creating ? 'Creating…' : 'Create user'}
          </button>
        </form>
      </section>

      <section className="card">
        <h2 style={{ margin: '0 0 16px', fontSize: 16 }}>Console users</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : users.length === 0 ? (
          <p className="muted">No team users yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Access</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.map((row) => {
                  const editing = editingId === row.id;
                  const isSelf = row.id === user?.id;
                  return (
                    <tr key={row.id}>
                      <td>
                        {editing ? (
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                          />
                        ) : (
                          <>
                            {row.name}
                            {isSelf ? <span className="muted"> · you</span> : null}
                          </>
                        )}
                      </td>
                      <td>{row.email}</td>
                      <td>
                        {editing ? (
                          <select
                            value={editRole}
                            onChange={(e) => setEditRole(e.target.value as ConsoleRole)}
                            disabled={isSelf}
                          >
                            <option value="Staff">Staff</option>
                            <option value="Admin">Admin</option>
                          </select>
                        ) : (
                          row.role
                        )}
                      </td>
                      <td>
                        {editing ? (
                          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                            <input
                              type="checkbox"
                              checked={editActive}
                              disabled={isSelf}
                              onChange={(e) => setEditActive(e.target.checked)}
                            />
                            Active
                          </label>
                        ) : row.isActive ? (
                          <span className="badge badge--published">Active</span>
                        ) : (
                          <span className="badge badge--inactive">Inactive</span>
                        )}
                      </td>
                      <td>{formatDate(row.updatedAt)}</td>
                      <td>
                        {editing ? (
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                            <input
                              type="password"
                              placeholder="New password (optional)"
                              value={editPassword}
                              onChange={(e) => setEditPassword(e.target.value)}
                              minLength={8}
                              style={{ minWidth: 160 }}
                            />
                            <button
                              type="button"
                              className="btn btn--sm"
                              disabled={savingId === row.id}
                              onClick={() => void handleSave(row.id)}
                            >
                              {savingId === row.id ? 'Saving…' : 'Save'}
                            </button>
                            <button
                              type="button"
                              className="btn btn--ghost btn--sm"
                              onClick={() => setEditingId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => beginEdit(row)}
                          >
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
