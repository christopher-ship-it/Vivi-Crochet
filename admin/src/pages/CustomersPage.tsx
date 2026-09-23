import { useEffect, useState } from 'react';
import { deleteAdminCustomer, listAdminCustomers } from '../api/customers';
import { ApiClientError } from '../api/client';
import { RowActionsMenu } from '../components/RowActionsMenu';
import type { AdminCustomerListItem } from '../types';
import { formatDate } from '../utils/format';

export function CustomersPage() {
  const [customers, setCustomers] = useState<AdminCustomerListItem[]>([]);
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  async function handleDelete(customer: AdminCustomerListItem) {
    const label = customer.fullName || customer.phoneNumber || customer.email || 'this customer';
    const ok = window.confirm(
      `Delete ${label} entirely?\n\nThis permanently removes their account, orders, course access, live bookings, and support messages. This cannot be undone.`,
    );
    if (!ok) return;

    setDeletingId(customer.id);
    setError(null);
    try {
      await deleteAdminCustomer(customer.id);
      setCustomers((prev) => prev.filter((c) => c.id !== customer.id));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to delete customer.');
    } finally {
      setDeletingId(null);
    }
  }

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

      {!loading && customers.length > 0 && (
        <div className="table-wrap">
          <table className="data-table data-table--customers">
            <colgroup>
              <col className="col-name" />
              <col className="col-track" />
              <col className="col-age" />
              <col className="col-country" />
              <col className="col-state" />
              <col className="col-city" />
              <col className="col-phone" />
              <col className="col-email" />
              <col className="col-orders" />
              <col className="col-date" />
              <col className="col-date" />
              <col className="col-status" />
              <col className="col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th className="col-name">Name</th>
                <th className="col-track">Track</th>
                <th className="col-age">Age</th>
                <th className="col-country">Country</th>
                <th className="col-state">State</th>
                <th className="col-city">City</th>
                <th className="col-phone">Phone</th>
                <th className="col-email">Email</th>
                <th className="col-orders">Orders</th>
                <th className="col-date">Signed up</th>
                <th className="col-date">Last active</th>
                <th className="col-status">Status</th>
                <th className="col-actions" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <td className="col-name col-clip" style={{ fontWeight: 600 }}>
                    {customer.fullName || '—'}
                  </td>
                  <td className="col-track">{customer.track || '—'}</td>
                  <td className="col-age">{customer.age ?? '—'}</td>
                  <td className="col-country col-clip">{customer.country || '—'}</td>
                  <td className="col-state col-clip">{customer.state || '—'}</td>
                  <td className="col-city col-clip">{customer.city || '—'}</td>
                  <td className="col-phone">{customer.phoneNumber || '—'}</td>
                  <td className="col-email col-clip" title={customer.email || undefined}>
                    {customer.email || '—'}
                  </td>
                  <td className="col-orders">{customer.orderCount}</td>
                  <td className="col-date">{formatDate(customer.signedUpAt)}</td>
                  <td className="col-date">{formatDate(customer.lastActiveAt)}</td>
                  <td className="col-status">
                    <span className={`badge ${customer.isActive ? 'badge--published' : 'badge--inactive'}`}>
                      {customer.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="col-actions">
                    <div className="data-table__actions">
                      <RowActionsMenu
                        label={`Actions for ${customer.fullName || 'customer'}`}
                        disabled={deletingId === customer.id}
                        items={[
                          {
                            id: 'delete',
                            label: deletingId === customer.id ? 'Deleting…' : 'Delete entirely',
                            danger: true,
                            disabled: deletingId === customer.id,
                            onClick: () => void handleDelete(customer),
                          },
                        ]}
                      />
                    </div>
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
