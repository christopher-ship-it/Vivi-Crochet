import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { listSpecialOffers, updateSpecialOffer, listFoundingMembers } from '../api/specialOffers';
import { listCourses } from '../api/courses';
import { ApiClientError } from '../api/client';
import type { AdminSpecialOffer, AdminSpecialOfferRequest, Course, FoundingMember } from '../types';
import { formatDate, formatInr } from '../utils/format';

type NumberDraft = number | '';

type OfferFormState = {
  offerName: string;
  priceLabel: string;
  badgeText: string;
  endedBadgeText: string;
  isActive: boolean;
  launchPrice: NumberDraft;
  launchLimit: NumberDraft;
  regularPriceAfterLaunch: NumberDraft;
  mrp: NumberDraft;
  accessDurationDays: NumberDraft;
  viralProjectCourseId: string;
};

function parseNumberDraft(raw: string): NumberDraft {
  if (raw.trim() === '') return '';
  const n = Number(raw);
  return Number.isFinite(n) ? n : '';
}

function toForm(offer: AdminSpecialOffer): OfferFormState {
  return {
    offerName: offer.offerName,
    priceLabel: offer.priceLabel ?? 'Launch price',
    badgeText: offer.badgeText ?? '',
    endedBadgeText: offer.endedBadgeText ?? '',
    isActive: offer.isActive,
    launchPrice: offer.launchPrice,
    launchLimit: offer.launchLimit,
    regularPriceAfterLaunch: offer.regularPriceAfterLaunch,
    mrp: offer.mrp,
    accessDurationDays: offer.accessDurationDays,
    viralProjectCourseId: offer.viralProjectCourseId ?? '',
  };
}

const PAGE_SIZE = 20;

export function SpecialOffersPage() {
  const [offer, setOffer] = useState<AdminSpecialOffer | null>(null);
  const [form, setForm] = useState<OfferFormState | null>(null);
  const [viralProjects, setViralProjects] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [members, setMembers] = useState<FoundingMember[]>([]);
  const [membersTotal, setMembersTotal] = useState(0);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'expired'>('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [offers, courses] = await Promise.all([listSpecialOffers(), listCourses()]);
        if (cancelled) return;
        const first = offers[0] ?? null;
        setOffer(first);
        setForm(first ? toForm(first) : null);
        setViralProjects(courses.filter((c) => c.type === 'ProjectCourse' && c.status === 'Published'));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Failed to load the special offer.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!offer) return;
    let cancelled = false;
    async function loadMembers() {
      setMembersLoading(true);
      setMembersError(null);
      try {
        const result = await listFoundingMembers(offer!.courseId, {
          search: submittedSearch || undefined,
          status: statusFilter || undefined,
          page,
          pageSize: PAGE_SIZE,
        });
        if (!cancelled) {
          setMembers(result.items);
          setMembersTotal(result.totalCount);
        }
      } catch (err) {
        if (!cancelled) {
          setMembersError(err instanceof ApiClientError ? err.message : 'Failed to load founding members.');
        }
      } finally {
        if (!cancelled) setMembersLoading(false);
      }
    }
    void loadMembers();
    return () => {
      cancelled = true;
    };
  }, [offer, submittedSearch, statusFilter, page]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(membersTotal / PAGE_SIZE)), [membersTotal]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!offer || !form) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const payload: AdminSpecialOfferRequest = {
        offerName: form.offerName.trim() || offer.offerName,
        priceLabel: form.priceLabel.trim() || 'Launch price',
        badgeText: form.badgeText.trim() || null,
        endedBadgeText: form.endedBadgeText.trim() || null,
        isActive: form.isActive,
        launchPrice: form.launchPrice === '' ? offer.launchPrice : form.launchPrice,
        launchLimit: form.launchLimit === '' ? offer.launchLimit : form.launchLimit,
        regularPriceAfterLaunch: form.regularPriceAfterLaunch === '' ? offer.regularPriceAfterLaunch : form.regularPriceAfterLaunch,
        mrp: form.mrp === '' ? offer.mrp : form.mrp,
        accessDurationDays: form.accessDurationDays === '' ? offer.accessDurationDays : form.accessDurationDays,
        viralProjectCourseId: form.viralProjectCourseId || null,
      };
      const updated = await updateSpecialOffer(offer.courseId, payload);
      setOffer(updated);
      setForm(toForm(updated));
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof ApiClientError ? err.message : 'Failed to save the special offer.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="loading-state">
        <p>Loading special offer…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-state">
        <h3>Could not load the special offer</h3>
        <p>{error}</p>
      </div>
    );
  }

  if (!offer || !form) {
    return (
      <div className="empty-state">
        <h3>No special offer configured</h3>
        <p>Seed or create a launch-offer bundle course before configuring the special offer here.</p>
      </div>
    );
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-header__title">Special Offers</h1>
          <p className="page-header__subtitle">₹999 Launch Offer — VIVI Crochet Circle Founding Membership</p>
        </div>
      </header>

      <div className="stat-grid">
        <div className="card card--stat">
          <span className="card__label">Founding members</span>
          <span className="card__value">{offer.completedPurchaseCount} / {offer.launchLimit}</span>
        </div>
        <div className="card card--stat">
          <span className="card__label">Remaining</span>
          <span className="card__value">{offer.remaining}</span>
        </div>
        <div className="card card--stat">
          <span className="card__label">Status</span>
          <span className="card__value">
            <span className={`badge ${offer.isActive ? 'badge--published' : 'badge--inactive'}`}>
              {offer.isActive ? 'ACTIVE' : 'INACTIVE'}
            </span>
          </span>
        </div>
        <div className="card card--stat">
          <span className="card__label">Revenue</span>
          <span className="card__value">{formatInr(offer.revenue)}</span>
        </div>
      </div>

      <form className="card form-dense" onSubmit={handleSave}>
        {saveError && <div className="form-error">{saveError}</div>}
        {saved && <div className="alert alert--success">Special offer saved.</div>}

        <div className="form-grid-6">
          <div className="form-field span-3">
            <label htmlFor="offerName">Offer name</label>
            <input
              id="offerName"
              value={form.offerName}
              onChange={(e) => setForm({ ...form, offerName: e.target.value })}
              maxLength={200}
              required
            />
          </div>

          <div className="form-field span-3 form-field--checkbox">
            <label htmlFor="isActive">
              <input
                id="isActive"
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              Offer is ACTIVE (unchecking stops selling at the launch price immediately)
            </label>
          </div>

          <div className="form-field span-3">
            <label htmlFor="badgeText">App badge while live</label>
            <input
              id="badgeText"
              maxLength={80}
              placeholder="LAUNCH OFFER · FIRST 100 USERS"
              value={form.badgeText}
              onChange={(e) => setForm({ ...form, badgeText: e.target.value })}
            />
          </div>

          <div className="form-field span-3">
            <label htmlFor="endedBadgeText">App badge when ended</label>
            <input
              id="endedBadgeText"
              maxLength={80}
              placeholder="LAUNCH OFFER ENDED"
              value={form.endedBadgeText}
              onChange={(e) => setForm({ ...form, endedBadgeText: e.target.value })}
            />
          </div>

          <div className="form-field span-2">
            <label htmlFor="priceLabel">Price label</label>
            <input
              id="priceLabel"
              maxLength={60}
              placeholder="Launch price"
              value={form.priceLabel}
              onChange={(e) => setForm({ ...form, priceLabel: e.target.value })}
            />
          </div>

          <div className="form-field span-2">
            <label htmlFor="launchPrice">{form.priceLabel.trim() || 'Launch price'}</label>
            <div className="input-affix">
              <span className="input-affix__prefix">₹</span>
              <input
                id="launchPrice"
                type="number"
                min={1}
                value={form.launchPrice}
                onChange={(e) => setForm({ ...form, launchPrice: parseNumberDraft(e.target.value) })}
              />
            </div>
          </div>

          <div className="form-field span-2">
            <label htmlFor="launchLimit">Maximum members</label>
            <input
              id="launchLimit"
              type="number"
              min={offer.completedPurchaseCount}
              value={form.launchLimit}
              onChange={(e) => setForm({ ...form, launchLimit: parseNumberDraft(e.target.value) })}
            />
          </div>

          <div className="form-field span-2">
            <label htmlFor="accessDurationDays">Access duration (days)</label>
            <input
              id="accessDurationDays"
              type="number"
              min={1}
              value={form.accessDurationDays}
              onChange={(e) => setForm({ ...form, accessDurationDays: parseNumberDraft(e.target.value) })}
            />
          </div>

          <div className="form-field span-2">
            <label htmlFor="regularPriceAfterLaunch">Regular price after launch</label>
            <div className="input-affix">
              <span className="input-affix__prefix">₹</span>
              <input
                id="regularPriceAfterLaunch"
                type="number"
                min={1}
                value={form.regularPriceAfterLaunch}
                onChange={(e) => setForm({ ...form, regularPriceAfterLaunch: parseNumberDraft(e.target.value) })}
              />
            </div>
          </div>

          <div className="form-field span-2">
            <label htmlFor="mrp">MRP (strikethrough total)</label>
            <div className="input-affix">
              <span className="input-affix__prefix">₹</span>
              <input
                id="mrp"
                type="number"
                min={1}
                value={form.mrp}
                onChange={(e) => setForm({ ...form, mrp: parseNumberDraft(e.target.value) })}
              />
            </div>
          </div>

          <div className="form-field span-2">
            <label htmlFor="viralProject">Free viral project</label>
            <select
              id="viralProject"
              value={form.viralProjectCourseId}
              onChange={(e) => setForm({ ...form, viralProjectCourseId: e.target.value })}
            >
              <option value="">— None —</option>
              {viralProjects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="form-field span-6">
            <div className="form-label-row">
              <span className="form-label">Included courses (current regular price)</span>
            </div>
            <div className="check-list check-list--compact">
              {offer.includedCourses.map((c) => (
                <span key={c.id} className="choice">
                  <span className="cell-clip">{c.name}</span>
                  <span className="form-hint">{formatInr(c.price)}</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="form-actions form-actions--sticky">
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save offer'}
          </button>
        </div>
      </form>

      <section className="section-block">
        <div className="section-block__head">
          <h2 className="section-title" style={{ marginBottom: 0 }}>Founding members</h2>
        </div>

        <form
          className="toolbar inline-form page-toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setSubmittedSearch(search.trim());
          }}
        >
          <label htmlFor="member-search" className="sr-only">Search members</label>
          <input
            id="member-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, email, phone, or member #"
            style={{ minWidth: 240 }}
          />
          <button type="submit" className="btn">Search</button>
          <select
            value={statusFilter}
            onChange={(e) => {
              setPage(1);
              setStatusFilter(e.target.value as '' | 'active' | 'expired');
            }}
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
          </select>
        </form>

        {membersLoading && (
          <div className="loading-state">
            <p>Loading members…</p>
          </div>
        )}

        {membersError && (
          <div className="error-state">
            <h3>Could not load members</h3>
            <p>{membersError}</p>
          </div>
        )}

        {!membersLoading && !membersError && members.length === 0 && (
          <div className="empty-state">
            <h3>No founding members yet</h3>
            <p>Successful ₹999 launch-offer purchases will appear here.</p>
          </div>
        )}

        {!membersLoading && members.length > 0 && (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Member #</th>
                    <th>Customer</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Joined</th>
                    <th>Expires</th>
                    <th>Payment</th>
                    <th>Order</th>
                    <th>Status</th>
                    <th>Viral project</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id}>
                      <td className="cell-strong">#{String(m.memberNumber).padStart(3, '0')}</td>
                      <td>{m.customerName || '—'}</td>
                      <td className="cell-clip">{m.customerEmail}</td>
                      <td>{m.customerPhone || '—'}</td>
                      <td>{formatDate(m.joinedDate)}</td>
                      <td>{formatDate(m.expiryDate)}</td>
                      <td>{formatInr(m.amountPaid)}</td>
                      <td className="cell-clip">{m.orderNumber}</td>
                      <td>
                        <span className={`badge ${m.isActive ? 'badge--published' : 'badge--inactive'}`}>
                          {m.isActive ? 'ACTIVE' : 'EXPIRED'}
                        </span>
                      </td>
                      <td>{m.viralProjectCourseName || '—'}</td>
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
