import { useEffect, useState } from 'react';
import { listAdminCustomers } from '../api/customers';
import { ApiClientError } from '../api/client';
import type { AdminCustomerListItem } from '../types';
import { formatDate } from '../utils/format';

export function CustomersPage() {
  const [customers, setCustomers] = useState<AdminCustomerListItem[]>([]);
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await listAdminCustomers(submittedQuery);
        if (!cancelled) setCustomers(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Failed to load customers.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [submittedQuery]);

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-header__title">Customers</h1>
          <p className="page-header__subtitle">
            Everyone who has signed in to the VIVI app with their mobile number.
          </p>
        </div>
      </header>

      <form
        className="toolbar"
        style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}
        onSubmit={(e) => {
          e.preventDefault();
          setSubmittedQuery(query.trim());
        }}
      >
        <label htmlFor="customer-search" style={{ fontWeight: 600 }}>
          Search
        </label>
        <input
          id="customer-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name or phone"
          style={{ minWidth: 220 }}
        />
        <button type="submit" className="btn btn--sm">
          Search
        </button>
        {submittedQuery ? (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => {
              setQuery('');
              setSubmittedQuery('');
            }}
          >
            Clear
          </button>
        ) : null}
      </form>

      {loading && (
        <div className="loading-state">
          <p>Loading customers…</p>
        </div>
      )}

      {error && (
        <div className="error-state">
          <h3>Could not load customers</h3>
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && customers.length === 0 && (
        <div className="empty-state">
          <h3>No customers yet</h3>
          <p>App sign-ins via OTP will appear here.</p>
        </div>
      )}

      {!loading && !error && customers.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Orders</th>
                <th>Signed up</th>
                <th>Last active</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <td style={{ fontWeight: 600 }}>{customer.fullName || '—'}</td>
                  <td>{customer.phoneNumber || '—'}</td>
                  <td>{customer.email || '—'}</td>
                  <td>{customer.orderCount}</td>
                  <td>{formatDate(customer.signedUpAt)}</td>
                  <td>{formatDate(customer.lastActiveAt)}</td>
                  <td>
                    <span className={`badge ${customer.isActive ? 'badge--published' : 'badge--inactive'}`}>
                      {customer.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
