import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listCourses } from '../api/courses';
import { listVideos } from '../api/videos';
import { listSpecialOffers } from '../api/specialOffers';
import { listAdminOrders } from '../api/orders';
import { ApiClientError } from '../api/client';
import type { AdminOrderListItem, AdminSpecialOffer, Course, Video } from '../types';
import { formatDate, formatInr, formatMoney, parseApiDate } from '../utils/format';

export function DashboardPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [specialOffer, setSpecialOffer] = useState<AdminSpecialOffer | null>(null);
  const [unconfirmed, setUnconfirmed] = useState<AdminOrderListItem[]>([]);
  const [windowDate, setWindowDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [courseData, videoData, offers, orders] = await Promise.all([
          listCourses(),
          listVideos(),
          listSpecialOffers().catch(() => []),
          listAdminOrders().catch(() => [] as AdminOrderListItem[]),
        ]);
        if (!cancelled) {
          setCourses(courseData);
          setVideos(videoData);
          setSpecialOffer(offers[0] ?? null);
          // Unpaid for 15+ min: abandoned checkouts, or payments Razorpay captured that we never recorded.
          const cutoff = Date.now() - 15 * 60 * 1000;
          setUnconfirmed(
            orders.filter((o) =>
              o.status === 'PendingPayment'
              && o.paymentStatus !== 'Failed'
              && parseApiDate(o.createdAt).getTime() < cutoff),
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Failed to load dashboard.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const publishedCourses = courses.filter((c) => c.status === 'Published').length;
  const draftCourses = courses.filter((c) => c.status === 'Draft').length;
  const publishedVideos = videos.filter((v) => v.status === 'Published').length;

  // Same cut-off as the Orders pages: a day D shows orders placed D 5:00 PM to D+1 5:00 PM (local time).
  const shownUnconfirmed = (() => {
    if (!windowDate) return unconfirmed;
    const [y, m, d] = windowDate.split('-').map(Number);
    const from = new Date(y, m - 1, d, 17, 0, 0, 0);
    const to = new Date(y, m - 1, d + 1, 17, 0, 0, 0);
    return unconfirmed.filter((o) => {
      const t = parseApiDate(o.createdAt);
      return t >= from && t < to;
    });
  })();

  const recentCourses = [...courses]
    .sort((a, b) => parseApiDate(b.updatedAt).getTime() - parseApiDate(a.updatedAt).getTime())
    .slice(0, 5);

  if (loading) {
    return (
      <div className="loading-state">
        <p>Loading dashboard…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-state">
        <h3>Could not load dashboard</h3>
        <p>{error}</p>
        <button type="button" className="btn" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-header__title">Dashboard</h1>
          <p className="page-header__subtitle">Overview of your courses and videos</p>
        </div>
        <div className="page-header__actions">
          <Link to="/courses/new" className="btn btn--primary">New course</Link>
        </div>
      </header>

      <div className="stat-grid">
        <div className="card card--stat">
          <span className="card__label">Total courses</span>
          <span className="card__value">{courses.length}</span>
        </div>
        <div className="card card--stat">
          <span className="card__label">Published courses</span>
          <span className="card__value">{publishedCourses}</span>
        </div>
        <div className="card card--stat">
          <span className="card__label">Draft courses</span>
          <span className="card__value">{draftCourses}</span>
        </div>
        <div className="card card--stat">
          <span className="card__label">Total videos</span>
          <span className="card__value">{videos.length}</span>
        </div>
      </div>

      <section className="section-block dashboard-section">
        <div className="section-block__head">
          <h2 className="section-title" style={{ marginBottom: 0 }}>Recent courses</h2>
          <Link to="/courses" className="btn btn--ghost btn--sm">View all</Link>
        </div>
        {recentCourses.length === 0 ? (
          <div className="empty-state">
            <h3>No courses yet</h3>
            <p>Create your first course to start uploading lessons.</p>
            <Link to="/courses/new" className="btn btn--primary">Create your first course</Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Videos</th>
                  <th>Status</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {recentCourses.map((course) => (
                  <tr key={course.id}>
                    <td>
                      <Link to={`/courses/${course.id}`} className="cell-link">
                        {course.name}
                      </Link>
                    </td>
                    <td>{course.videoCount}</td>
                    <td>
                      <span className={`badge badge--${course.status.toLowerCase()}`}>
                        {course.status}
                      </span>
                    </td>
                    <td>{formatDate(course.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {unconfirmed.length > 0 && (
        <section className="section-block card dashboard-section">
          <div className="card__header">
            <div>
              <h2 className="card__title">Awaiting payment confirmation ({shownUnconfirmed.length})</h2>
              <p className="card__subtitle">
                Unpaid orders older than 15 minutes. If the customer was charged, open Payments and use Sync with the Razorpay payment ID.
              </p>
            </div>
            <Link to="/payments" className="btn btn--ghost btn--sm">Payments</Link>
          </div>
          <div className="page-toolbar">
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span>Orders 5 PM to next 5 PM, from</span>
              <input
                type="date"
                value={windowDate}
                onChange={(e) => setWindowDate(e.target.value)}
                style={{ padding: '6px 8px' }}
              />
            </label>
            {windowDate ? (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setWindowDate('')}>
                Clear
              </button>
            ) : null}
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Placed</th>
                </tr>
              </thead>
              <tbody>
                {shownUnconfirmed.slice(0, 10).map((o) => (
                  <tr key={o.id}>
                    <td><Link to={`/orders/${o.id}`} className="cell-link">{o.orderNumber}</Link></td>
                    <td>{o.customerName}{o.customerEmail ? ` · ${o.customerEmail}` : ''}</td>
                    <td>{formatMoney(o.totalAmount, o.currency ?? 'INR')}</td>
                    <td>{formatDate(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {specialOffer && (
        <section className="section-block card dashboard-section">
          <div className="card__header">
            <div>
              <h2 className="card__title">{specialOffer.offerName}</h2>
              <p className="card__subtitle">
                ₹{specialOffer.launchPrice} Launch Offer ·{' '}
                <span className={`badge ${specialOffer.isActive ? 'badge--published' : 'badge--inactive'}`}>
                  {specialOffer.isActive ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </p>
            </div>
            <Link to="/special-offers" className="btn btn--ghost btn--sm">Manage</Link>
          </div>
          <div className="stat-grid">
            <div className="card card--stat">
              <span className="card__label">Founding members</span>
              <span className="card__value">
                {specialOffer.completedPurchaseCount} / {specialOffer.launchLimit}
              </span>
            </div>
            <div className="card card--stat">
              <span className="card__label">Remaining</span>
              <span className="card__value">{specialOffer.remaining}</span>
            </div>
            <div className="card card--stat">
              <span className="card__label">Revenue</span>
              <span className="card__value">
                {formatInr(specialOffer.revenue)}
                {specialOffer.revenueUsd ? ` + ${formatMoney(specialOffer.revenueUsd, 'USD')}` : ''}
              </span>
            </div>
          </div>
        </section>
      )}

      {videos.length > 0 && (
        <section className="section-block card dashboard-section">
          <div className="card__header">
            <div>
              <h2 className="card__title">Published videos</h2>
              <p className="card__subtitle">
                {publishedVideos} of {videos.length} videos published
              </p>
            </div>
            <span className="card__value" style={{ fontSize: 24 }}>
              {Math.round((publishedVideos / videos.length) * 100)}%
            </span>
          </div>
          <div className="progress-bar">
            <div
              className="progress-bar__fill"
              style={{ width: `${(publishedVideos / videos.length) * 100}%` }}
            />
          </div>
        </section>
      )}
    </>
  );
}
