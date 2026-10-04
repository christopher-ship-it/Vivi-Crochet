import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { listSpecialOffers, updateSpecialOffer, listFoundingMembers } from '../api/specialOffers';
import { listCourses } from '../api/courses';
import { ApiClientError } from '../api/client';
import type { AdminSpecialOffer, AdminSpecialOfferRequest, Course, FoundingMember } from '../types';
import { formatDate, formatInr, formatMoney } from '../utils/format';
import { OfferTabs } from '../components/OfferTabs';

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
  /** Sell the membership in the US (USD). */
  usEnabled: boolean;
  usLaunchPrice: NumberDraft;
  usRegularPrice: NumberDraft;
  usMrp: NumberDraft;
  /** Included course ids in the order the app shows them. */
  courseOrder: string[];
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
    usEnabled: Boolean(offer.usPrice),
    usLaunchPrice: offer.usPrice?.launchPrice ?? '',
    usRegularPrice: offer.usPrice?.regularPriceAfterLaunch ?? '',
    usMrp: offer.usPrice?.mrp ? offer.usPrice.mrp : '',
    courseOrder: offer.includedCourses.map((c) => c.id),
  };
}

const PAGE_SIZE = 20;

export function SpecialOffersPage() {
  const [offer, setOffer] = useState<AdminSpecialOffer | null>(null);
  const [form, setForm] = useState<OfferFormState | null>(null);
  const [viralProjects, setViralProjects] = useState<Course[]>([]);
  const [bundles, setBundles] = useState<Course[]>([]);
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
        setBundles(courses.filter((c) => c.type === 'Bundle'));
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
    if (form.usEnabled && (form.usLaunchPrice === '' || form.usLaunchPrice <= 0 || form.usRegularPrice === '' || form.usRegularPrice <= 0)) {
      setSaveError('Enter the US launch price and US regular price in dollars, or turn off "Sell in the United States".');
      return;
    }
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
        usPrice: form.usEnabled
          ? {
              launchPrice: Number(form.usLaunchPrice),
              regularPriceAfterLaunch: Number(form.usRegularPrice),
              mrp: form.usMrp === '' ? 0 : Number(form.usMrp),
            }
          : null,
        removeUsPrice: !form.usEnabled && Boolean(offer.usPrice),
        includedCourseIds: form.courseOrder,
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

  function moveCourse(index: number, delta: -1 | 1) {
    setForm((f) => {
      if (!f) return f;
      const target = index + delta;
      if (target < 0 || target >= f.courseOrder.length) return f;
      const next = [...f.courseOrder];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...f, courseOrder: next };
    });
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
      <>
        <header className="page-header">
          <div>
            <h1 className="page-header__title">Special Offers</h1>
            <p className="page-header__subtitle">Create bundles of courses</p>
          </div>
        </header>

      <section className="section-block so-panel">
        <div className="section-block__head">
          <h2 className="section-title" style={{ marginBottom: 0 }}>Bundles</h2>
          <Link to="/courses/new?type=Bundle" className="btn btn--primary">New bundle</Link>
        </div>
        {bundles.length === 0 ? (
          <div className="empty-state">
            <h3>No bundles yet</h3>
            <p>Create a bundle, pick the courses it includes and set its price.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Price</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {bundles.map((b) => (
                  <tr key={b.id}>
                    <td className="cell-strong">
                      <Link to={`/courses/${b.id}`} className="cell-link">{b.name}</Link>
                    </td>
                    <td>{formatInr(b.price)}</td>
                    <td>
                      <span className={`badge badge--${b.status.toLowerCase()}`}>{b.status}</span>
                    </td>
                    <td><Link to={`/courses/${b.id}/edit`} className="btn btn--ghost btn--sm">Edit</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </>
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

      <OfferTabs />

      <div className="stat-grid special-offer-stats">
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
          <span className="card__value">
            {formatInr(offer.revenue)}
            {offer.revenueUsd ? ` + ${formatMoney(offer.revenueUsd, 'USD')}` : ''}
          </span>
        </div>
      </div>

      <form className="form-dense special-offer-form" onSubmit={handleSave}>
        {saveError && <div className="form-error">{saveError}</div>}
        {saved && <div className="alert alert--success">Special offer saved.</div>}

        <div className="so-sections">
          <section className="so-card">
            <header className="so-card__head">
              <h2 className="so-card__title">Offer details</h2>
              <p className="so-card__desc">Name, visibility and the badges shown on the offer card in the app.</p>
            </header>
            <div className="form-grid-6 so-grid">
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

          </div>
          </section>

          <section className="so-card">
            <header className="so-card__head">
              <h2 className="so-card__title">Pricing & access</h2>
              <p className="so-card__desc">Launch price, regular price, member limit and how long membership lasts.</p>
            </header>
            <div className="form-grid-6 so-grid">
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

          </div>
          </section>

          <section className="so-card">
            <header className="so-card__head">
              <h2 className="so-card__title">United States</h2>
              <p className="so-card__desc">Sell the membership to US customers in dollars.</p>
            </header>
            <div className="form-grid-6 so-grid">
          <div className={`usd-panel span-6${form.usEnabled ? ' usd-panel--on' : ''}`}>
          <div className="form-field">
            <label className="choice" htmlFor="usEnabled">
              <input
                id="usEnabled"
                type="checkbox"
                checked={form.usEnabled}
                onChange={(e) => setForm({ ...form, usEnabled: e.target.checked })}
              />
              <span>Sell in the United States (priced in US dollars)</span>
            </label>
            <span className="form-hint">
              US customers only see this membership when US prices are set. Launch slots are shared with India.
            </span>
          </div>

          {form.usEnabled ? (
            <div className="usd-fields">
              <div className="form-field span-2">
                <label htmlFor="usLaunchPrice">US launch price</label>
                <div className="input-affix">
                  <span className="input-affix__prefix">$</span>
                  <input
                    id="usLaunchPrice"
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.usLaunchPrice}
                    onChange={(e) => setForm({ ...form, usLaunchPrice: parseNumberDraft(e.target.value) })}
                  />
                </div>
              </div>
              <div className="form-field span-2">
                <label htmlFor="usRegularPrice">US regular price after launch</label>
                <div className="input-affix">
                  <span className="input-affix__prefix">$</span>
                  <input
                    id="usRegularPrice"
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.usRegularPrice}
                    onChange={(e) => setForm({ ...form, usRegularPrice: parseNumberDraft(e.target.value) })}
                  />
                </div>
              </div>
              <div className="form-field span-2">
                <label htmlFor="usMrp">US MRP (strikethrough)</label>
                <div className="input-affix">
                  <span className="input-affix__prefix">$</span>
                  <input
                    id="usMrp"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="Optional"
                    value={form.usMrp}
                    onChange={(e) => setForm({ ...form, usMrp: parseNumberDraft(e.target.value) })}
                  />
                </div>
              </div>
            </div>
          ) : null}

          </div>

          </div>
          </section>

          <section className="so-card">
            <header className="so-card__head">
              <h2 className="so-card__title">Included courses</h2>
              <p className="so-card__desc">Everything a member gets. Reorder to control how the app lists them.</p>
            </header>
            <div className="form-grid-6 so-grid">
          <div className="form-field span-6">
            <div className="form-label-row">
              <span className="form-label">Included courses (current regular price)</span>
              <span className="form-hint">The app shows them in this order. Use the arrows, then Save offer.</span>
            </div>
            <ol className="order-list">
              {form.courseOrder.map((courseId, index) => {
                const c = offer.includedCourses.find((x) => x.id === courseId);
                if (!c) return null;
                return (
                  <li key={c.id} className="order-list__row">
                    <span className="order-list__num">{index + 1}</span>
                    <span className="cell-clip order-list__name">{c.name}</span>
                    <span className="form-hint">{formatInr(c.price)}</span>
                    <span className="order-list__btns">
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        disabled={index === 0}
                        onClick={() => moveCourse(index, -1)}
                        aria-label={`Move ${c.name} up`}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        disabled={index === form.courseOrder.length - 1}
                        onClick={() => moveCourse(index, 1)}
                        aria-label={`Move ${c.name} down`}
                      >
                        ↓
                      </button>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
          </div>
          </section>
        </div>

        <div className="form-actions form-actions--sticky so-actions">
          <span className="so-actions__note">Changes go live in the app as soon as you save.</span>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save offer'}
          </button>
        </div>
      </form>


      <section className="section-block so-panel">
        <div className="section-block__head">
          <h2 className="section-title" style={{ marginBottom: 0 }}>Bundles</h2>
          <Link to="/courses/new?type=Bundle" className="btn btn--primary">New bundle</Link>
        </div>
        {bundles.length === 0 ? (
          <div className="empty-state">
            <h3>No bundles yet</h3>
            <p>Create a bundle, pick the courses it includes and set its price.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Price</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {bundles.map((b) => (
                  <tr key={b.id}>
                    <td className="cell-strong">
                      <Link to={`/courses/${b.id}`} className="cell-link">{b.name}</Link>
                    </td>
                    <td>{formatInr(b.price)}</td>
                    <td>
                      <span className={`badge badge--${b.status.toLowerCase()}`}>{b.status}</span>
                    </td>
                    <td><Link to={`/courses/${b.id}/edit`} className="btn btn--ghost btn--sm">Edit</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="section-block so-panel special-offer-members">
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
                    <th>Founding ID</th>
                    <th>Customer ID</th>
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
                      <td className="cell-strong" style={{ whiteSpace: 'nowrap' }}>{m.memberCode || '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{m.customerCode || '—'}</td>
                      <td>{m.customerName || '—'}</td>
                      <td className="cell-clip">{m.customerEmail}</td>
                      <td>{m.customerPhone || '—'}</td>
                      <td>{formatDate(m.joinedDate)}</td>
                      <td>{formatDate(m.expiryDate)}</td>
                      <td>{formatMoney(m.amountPaid, m.currency)}</td>
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
