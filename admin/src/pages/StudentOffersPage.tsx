import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  createStudentCode,
  getStudentOffer,
  listStudentMembers,
  updateStudentCode,
  updateStudentPrice,
} from '../api/studentOffers';
import { ApiClientError } from '../api/client';
import { OfferTabs } from '../components/OfferTabs';
import type { AdminStudentCode, AdminStudentMember, AdminStudentOffer } from '../types';
import { formatDate, formatInr, formatMoney } from '../utils/format';

const PAGE_SIZE = 20;

type CodeDraft = {
  code: string;
  label: string;
  maxUses: string;
  expiresOn: string;
};

const emptyDraft: CodeDraft = { code: '', label: '', maxUses: '', expiresOn: '' };

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiClientError ? err.message : fallback;
}

/** End of the chosen day, so a code keeps working all day on its expiry date. */
function endOfDayIso(day: string): string | null {
  if (!day) return null;
  return new Date(`${day}T23:59:59`).toISOString();
}

export function StudentOffersPage() {
  const [offer, setOffer] = useState<AdminStudentOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [priceDraft, setPriceDraft] = useState('');
  const [usdDraft, setUsdDraft] = useState('');
  const [priceSaving, setPriceSaving] = useState(false);
  const [priceMessage, setPriceMessage] = useState<string | null>(null);

  const [draft, setDraft] = useState<CodeDraft>(emptyDraft);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const [members, setMembers] = useState<AdminStudentMember[]>([]);
  const [membersTotal, setMembersTotal] = useState(0);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [codeFilter, setCodeFilter] = useState('');
  const [page, setPage] = useState(1);

  const applyOffer = useCallback((next: AdminStudentOffer) => {
    setOffer(next);
    setPriceDraft(String(next.studentPrice));
    setUsdDraft(next.studentPriceUsd == null ? '' : String(next.studentPriceUsd));
  }, []);

  const reloadOffer = useCallback(async () => {
    applyOffer(await getStudentOffer());
  }, [applyOffer]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await getStudentOffer();
        if (!cancelled) applyOffer(result);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, 'Failed to load the student offer.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyOffer]);

  // The list reloads when the offer's enrolled count changes, so it stays current after edits.
  const enrolled = offer?.enrolledCount;
  useEffect(() => {
    if (enrolled === undefined) return;
    let cancelled = false;
    (async () => {
      setMembersLoading(true);
      setMembersError(null);
      try {
        const result = await listStudentMembers({
          search: submittedSearch || undefined,
          codeId: codeFilter || undefined,
          page,
          pageSize: PAGE_SIZE,
        });
        if (!cancelled) {
          setMembers(result.items);
          setMembersTotal(result.totalCount);
        }
      } catch (err) {
        if (!cancelled) setMembersError(errorMessage(err, 'Failed to load students.'));
      } finally {
        if (!cancelled) setMembersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enrolled, submittedSearch, codeFilter, page]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(membersTotal / PAGE_SIZE)), [membersTotal]);

  async function savePrice(e: FormEvent) {
    e.preventDefault();
    const value = Number(priceDraft);
    if (!Number.isInteger(value) || value < 1) {
      setPriceMessage('Enter a whole-rupee price greater than zero.');
      return;
    }
    const usd = usdDraft.trim() === '' ? null : Number(usdDraft);
    if (usd !== null && (!Number.isFinite(usd) || usd <= 0)) {
      setPriceMessage('Enter a dollar price greater than zero, or leave it empty.');
      return;
    }
    setPriceSaving(true);
    setPriceMessage(null);
    try {
      applyOffer(await updateStudentPrice(value, usd));
      setPriceMessage('Student price saved.');
    } catch (err) {
      setPriceMessage(errorMessage(err, 'Could not save the student price.'));
    } finally {
      setPriceSaving(false);
    }
  }

  async function addCode(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    setCreatedCode(null);
    try {
      const maxUses = draft.maxUses.trim() === '' ? null : Number(draft.maxUses);
      if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) {
        setCreateError('The use limit must be a whole number of at least 1, or left empty.');
        return;
      }
      const created = await createStudentCode({
        code: draft.code.trim() || null,
        label: draft.label.trim(),
        isActive: true,
        maxUses,
        expiresAt: endOfDayIso(draft.expiresOn),
      });
      setCreatedCode(created.code);
      setDraft(emptyDraft);
      await reloadOffer();
    } catch (err) {
      setCreateError(errorMessage(err, 'Could not create the code.'));
    } finally {
      setCreating(false);
    }
  }

  async function patchCode(code: AdminStudentCode, changes: Partial<AdminStudentCode>) {
    setRowError(null);
    try {
      const next = { ...code, ...changes };
      await updateStudentCode(code.id, {
        label: next.label,
        isActive: next.isActive,
        maxUses: next.maxUses ?? null,
        expiresAt: next.expiresAt ?? null,
      });
      await reloadOffer();
    } catch (err) {
      setRowError(errorMessage(err, 'Could not update the code.'));
    }
  }

  async function editLimit(code: AdminStudentCode) {
    const answer = window.prompt(
      `Maximum students for ${code.code} (${code.usedCount} used). Leave empty for no limit.`,
      code.maxUses == null ? '' : String(code.maxUses),
    );
    if (answer === null) return;
    const trimmed = answer.trim();
    const maxUses = trimmed === '' ? null : Number(trimmed);
    if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) {
      setRowError('The use limit must be a whole number of at least 1, or empty for no limit.');
      return;
    }
    await patchCode(code, { maxUses });
  }

  if (loading) {
    return (
      <div className="loading-state">
        <p>Loading student offer…</p>
      </div>
    );
  }

  if (error || !offer) {
    return (
      <div className="error-state">
        <h3>Could not load the student offer</h3>
        <p>{error ?? 'No special offer is configured yet.'}</p>
      </div>
    );
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-header__title">Special Offers</h1>
          <p className="page-header__subtitle">
            Student offer — students buy the founding bundle with a code. They get the founding-member badge
            and are not counted in the launch offer&apos;s limit.
          </p>
        </div>
      </header>

      <OfferTabs />

      <div className="stat-grid special-offer-stats">
        <div className="card card--stat">
          <span className="card__label">Students enrolled</span>
          <span className="card__value">{offer.enrolledCount}</span>
        </div>
        <div className="card card--stat">
          <span className="card__label">Student price</span>
          <span className="card__value">{formatInr(offer.studentPrice)}</span>
        </div>
        <div className="card card--stat">
          <span className="card__label">Access</span>
          <span className="card__value">{offer.accessDurationDays} days</span>
        </div>
        <div className="card card--stat">
          <span className="card__label">Revenue</span>
          <span className="card__value">
            {formatInr(offer.revenue)}
            {offer.revenueUsd ? ` + ${formatMoney(offer.revenueUsd, 'USD')}` : ''}
          </span>
        </div>
      </div>

      <section className="section-block so-panel">
        <div className="section-block__head">
          <h2 className="section-title" style={{ marginBottom: 0 }}>Student price</h2>
        </div>
        <form className="toolbar inline-form page-toolbar" onSubmit={savePrice}>
          <label htmlFor="student-price" className="form-hint">India (₹)</label>
          <input
            id="student-price"
            type="number"
            min={1}
            step={1}
            value={priceDraft}
            onChange={(e) => setPriceDraft(e.target.value)}
            style={{ width: 120 }}
          />
          <label htmlFor="student-price-usd" className="form-hint">US ($)</label>
          <input
            id="student-price-usd"
            type="number"
            min={0.01}
            step={0.01}
            value={usdDraft}
            onChange={(e) => setUsdDraft(e.target.value)}
            placeholder="Not available"
            disabled={!offer.usPriceConfigured}
            style={{ width: 120 }}
          />
          <button type="submit" className="btn btn--primary" disabled={priceSaving}>
            {priceSaving ? 'Saving…' : 'Save price'}
          </button>
          {priceMessage && <span className="form-hint">{priceMessage}</span>}
        </form>
        <p className="form-hint">
          Access length follows the launch offer ({offer.accessDurationDays} days). Change it on the Launch offer tab.
          {offer.usPriceConfigured
            ? ' Leave the US price empty to turn student codes off for US buyers.'
            : ' To offer students a US price, turn on US pricing for the membership on the Launch offer tab first.'}
        </p>
      </section>

      <section className="section-block so-panel">
        <div className="section-block__head">
          <h2 className="section-title" style={{ marginBottom: 0 }}>Student codes</h2>
        </div>

        <form className="toolbar inline-form page-toolbar" onSubmit={addCode} style={{ flexWrap: 'wrap' }}>
          <input
            aria-label="Who the code is for"
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            placeholder="Who is it for? (e.g. college name)"
            maxLength={120}
            required
            style={{ minWidth: 240 }}
          />
          <input
            aria-label="Code"
            value={draft.code}
            onChange={(e) => setDraft({ ...draft, code: e.target.value })}
            placeholder="Code (blank = auto, VIVISTUDENT####)"
            maxLength={40}
            style={{ minWidth: 240 }}
          />
          <input
            aria-label="Maximum students"
            type="number"
            min={1}
            step={1}
            value={draft.maxUses}
            onChange={(e) => setDraft({ ...draft, maxUses: e.target.value })}
            placeholder="Max students (optional)"
            style={{ width: 190 }}
          />
          <label className="form-hint" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            Expires on
            <input
              type="date"
              value={draft.expiresOn}
              onChange={(e) => setDraft({ ...draft, expiresOn: e.target.value })}
            />
          </label>
          <button type="submit" className="btn btn--primary" disabled={creating}>
            {creating ? 'Creating…' : 'Create code'}
          </button>
        </form>
        {createError && <div className="form-error">{createError}</div>}
        {createdCode && (
          <div className="alert alert--success">
            Code created: <strong>{createdCode}</strong>. Share it with the students.
          </div>
        )}
        {rowError && <div className="form-error">{rowError}</div>}

        {offer.codes.length === 0 ? (
          <div className="empty-state">
            <h3>No student codes yet</h3>
            <p>Create a code above and give it to your students. They enter it at checkout.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>For</th>
                  <th>Used</th>
                  <th>Expires</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {offer.codes.map((c) => {
                  const full = c.maxUses != null && c.usedCount >= c.maxUses;
                  const live = c.isActive && !c.isExpired && !full;
                  return (
                    <tr key={c.id}>
                      <td className="cell-strong" style={{ whiteSpace: 'nowrap' }}>{c.code}</td>
                      <td>{c.label}</td>
                      <td>{c.usedCount}{c.maxUses != null ? ` / ${c.maxUses}` : ''}</td>
                      <td>{c.expiresAt ? formatDate(c.expiresAt) : '—'}</td>
                      <td>
                        <span className={`badge ${live ? 'badge--published' : 'badge--inactive'}`}>
                          {!c.isActive ? 'OFF' : c.isExpired ? 'EXPIRED' : full ? 'FULL' : 'ACTIVE'}
                        </span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => void patchCode(c, { isActive: !c.isActive })}
                        >
                          {c.isActive ? 'Turn off' : 'Turn on'}
                        </button>{' '}
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => void editLimit(c)}>
                          Edit limit
                        </button>{' '}
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => {
                            setPage(1);
                            setCodeFilter(codeFilter === c.id ? '' : c.id);
                          }}
                        >
                          {codeFilter === c.id ? 'Show all students' : 'Show students'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="section-block so-panel special-offer-members">
        <div className="section-block__head">
          <h2 className="section-title" style={{ marginBottom: 0 }}>Students</h2>
        </div>

        <form
          className="toolbar inline-form page-toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setSubmittedSearch(search.trim());
          }}
        >
          <label htmlFor="student-search" className="sr-only">Search students</label>
          <input
            id="student-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, email, phone, or member ID"
            style={{ minWidth: 240 }}
          />
          <button type="submit" className="btn">Search</button>
          <select
            aria-label="Filter by code"
            value={codeFilter}
            onChange={(e) => {
              setPage(1);
              setCodeFilter(e.target.value);
            }}
          >
            <option value="">All codes</option>
            {offer.codes.map((c) => (
              <option key={c.id} value={c.id}>{c.code} — {c.label}</option>
            ))}
          </select>
        </form>

        {membersLoading && (
          <div className="loading-state">
            <p>Loading students…</p>
          </div>
        )}

        {membersError && (
          <div className="error-state">
            <h3>Could not load students</h3>
            <p>{membersError}</p>
          </div>
        )}

        {!membersLoading && !membersError && members.length === 0 && (
          <div className="empty-state">
            <h3>No students yet</h3>
            <p>Students who pay with a student code will appear here.</p>
          </div>
        )}

        {!membersLoading && members.length > 0 && (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Student #</th>
                    <th>Member ID</th>
                    <th>Customer ID</th>
                    <th>Customer</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Code</th>
                    <th>For</th>
                    <th>Joined</th>
                    <th>Expires</th>
                    <th>Payment</th>
                    <th>Order</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id}>
                      <td className="cell-strong">#{String(m.memberNumber).padStart(3, '0')}</td>
                      <td className="cell-strong" style={{ whiteSpace: 'nowrap' }}>{m.memberCode || '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{m.customerCode || '—'}</td>
                      <td>{m.customerName || '—'}</td>
                      <td className="cell-clip">{m.customerEmail}</td>
                      <td>{m.customerPhone || '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{m.studentCode || '—'}</td>
                      <td>{m.studentLabel || '—'}</td>
                      <td>{formatDate(m.joinedDate)}</td>
                      <td>{formatDate(m.expiryDate)}</td>
                      <td>{formatMoney(m.amountPaid, m.currency)}</td>
                      <td className="cell-clip">{m.orderNumber}</td>
                      <td>
                        <span className={`badge ${m.isActive ? 'badge--published' : 'badge--inactive'}`}>
                          {m.isActive ? 'ACTIVE' : 'EXPIRED'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="toolbar page-toolbar">
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span className="form-hint">Page {page} of {totalPages}</span>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
