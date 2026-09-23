import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { getSupportUnreadCount } from '../api/support';
import { useAuth } from '../auth/AuthContext';
import { GlobalSearch } from '../components/GlobalSearch';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/products', label: 'Shop products' },
  { to: '/customers', label: 'Customers' },
  { to: '/notifications', label: 'Notifications' },
  { to: '/support', label: 'Support' },
];

const COURSE_DASHBOARD_ITEMS = [
  { to: '/live', label: 'Live classes' },
  { to: '/courses', label: 'Courses & videos' },
  { to: '/categories', label: 'Categories' },
];

const ORDER_ITEMS = [
  { to: '/orders', label: 'Product orders' },
  { to: '/course-orders', label: 'Course & video orders' },
];

const BOOKING_ITEMS = [
  { to: '/live-bookings', label: 'Live Class Bookings' },
];

const DISABLED_NAV = ['Production', 'Payments', 'Audit log'];

function isOrdersPath(pathname: string): boolean {
  return (
    pathname === '/orders' ||
    pathname.startsWith('/orders/') ||
    pathname === '/course-orders' ||
    pathname.startsWith('/course-orders/')
  );
}

function isBookingsPath(pathname: string): boolean {
  return pathname === '/live-bookings' || pathname.startsWith('/live-bookings/');
}

function isCourseDashboardPath(pathname: string): boolean {
  return (
    pathname === '/live' ||
    pathname.startsWith('/live/') ||
    pathname === '/courses' ||
    pathname.startsWith('/courses/') ||
    pathname === '/categories' ||
    pathname.startsWith('/categories/')
  );
}

export function AdminLayout() {
  const { user, logout, isFullAdmin } = useAuth();
  const location = useLocation();
  const ordersActive = isOrdersPath(location.pathname);
  const bookingsActive = isBookingsPath(location.pathname);
  const courseDashActive = isCourseDashboardPath(location.pathname);
  const [ordersOpen, setOrdersOpen] = useState(ordersActive);
  const [bookingsOpen, setBookingsOpen] = useState(bookingsActive);
  const [courseDashOpen, setCourseDashOpen] = useState(courseDashActive);
  const [supportUnread, setSupportUnread] = useState(0);

  const roleLabel =
    user?.role === 'Admin'
      ? 'Admin · full access'
      : user?.role === 'Staff'
        ? 'Staff · day-to-day access'
        : 'Console access';

  const refreshSupportUnread = useCallback(async () => {
    try {
      setSupportUnread(await getSupportUnreadCount());
    } catch {
      // Keep last known count if the badge poll fails.
    }
  }, []);

  useEffect(() => {
    if (ordersActive) setOrdersOpen(true);
  }, [ordersActive]);

  useEffect(() => {
    if (bookingsActive) setBookingsOpen(true);
  }, [bookingsActive]);

  useEffect(() => {
    if (courseDashActive) setCourseDashOpen(true);
  }, [courseDashActive]);

  useEffect(() => {
    void refreshSupportUnread();
    const timer = window.setInterval(() => void refreshSupportUnread(), 60_000);
    const onRefresh = () => void refreshSupportUnread();
    window.addEventListener('vivi:support-unread-refresh', onRefresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('vivi:support-unread-refresh', onRefresh);
    };
  }, [refreshSupportUnread]);

  useEffect(() => {
    if (location.pathname.startsWith('/support')) {
      void refreshSupportUnread();
    }
  }, [location.pathname, refreshSupportUnread]);

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-sidebar__brand">
          <img src="/vivi-logo.png" alt="VIVI Crochet" className="admin-sidebar__logo" />
          <div>
            <div className="admin-sidebar__name">VIVI Admin</div>
            <div className="admin-sidebar__tag">Console</div>
          </div>
        </div>

        <nav className="admin-nav" aria-label="Main">
          <div className="admin-nav__section">Menu</div>

          {NAV_ITEMS.slice(0, 1).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `admin-nav__link${isActive ? ' admin-nav__link--active' : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}

          <div className="admin-nav__group">
            <button
              type="button"
              className={`admin-nav__group-toggle${courseDashActive ? ' admin-nav__group-toggle--active' : ''}${courseDashOpen ? ' admin-nav__group-toggle--open' : ''}`}
              aria-expanded={courseDashOpen}
              onClick={() => setCourseDashOpen((open) => !open)}
            >
              <span>Course dashboard</span>
              <span className="admin-nav__chevron" aria-hidden>
                ▾
              </span>
            </button>
            {courseDashOpen ? (
              <div className="admin-nav__group-items">
                {COURSE_DASHBOARD_ITEMS.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `admin-nav__link admin-nav__link--child${isActive ? ' admin-nav__link--active' : ''}`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            ) : null}
          </div>

          <div className="admin-nav__group">
            <button
              type="button"
              className={`admin-nav__group-toggle${ordersActive ? ' admin-nav__group-toggle--active' : ''}${ordersOpen ? ' admin-nav__group-toggle--open' : ''}`}
              aria-expanded={ordersOpen}
              onClick={() => setOrdersOpen((open) => !open)}
            >
              <span>Orders</span>
              <span className="admin-nav__chevron" aria-hidden>
                ▾
              </span>
            </button>
            {ordersOpen ? (
              <div className="admin-nav__group-items">
                {ORDER_ITEMS.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `admin-nav__link admin-nav__link--child${isActive ? ' admin-nav__link--active' : ''}`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            ) : null}
          </div>

          <div className="admin-nav__group">
            <button
              type="button"
              className={`admin-nav__group-toggle${bookingsActive ? ' admin-nav__group-toggle--active' : ''}${bookingsOpen ? ' admin-nav__group-toggle--open' : ''}`}
              aria-expanded={bookingsOpen}
              onClick={() => setBookingsOpen((open) => !open)}
            >
              <span>Bookings</span>
              <span className="admin-nav__chevron" aria-hidden>
                ▾
              </span>
            </button>
            {bookingsOpen ? (
              <div className="admin-nav__group-items">
                {BOOKING_ITEMS.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `admin-nav__link admin-nav__link--child${isActive ? ' admin-nav__link--active' : ''}`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            ) : null}
          </div>

          {NAV_ITEMS.slice(1).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `admin-nav__link${isActive ? ' admin-nav__link--active' : ''}`
              }
            >
              <span className="admin-nav__link-label">
                {item.label}
                {item.to === '/support' && supportUnread > 0 ? (
                  <span className="admin-nav__badge" aria-label={`${supportUnread} unread`}>
                    {supportUnread > 99 ? '99+' : supportUnread}
                  </span>
                ) : null}
              </span>
            </NavLink>
          ))}

          {isFullAdmin ? (
            <NavLink
              to="/team"
              className={({ isActive }) =>
                `admin-nav__link${isActive ? ' admin-nav__link--active' : ''}`
              }
            >
              Team users
            </NavLink>
          ) : null}

          {DISABLED_NAV.map((label) => (
            <span key={label} className="admin-nav__link admin-nav__link--disabled">
              {label}
            </span>
          ))}
        </nav>

        <div className="admin-sidebar__user">
          <div className="admin-sidebar__user-name">{user?.name ?? 'Admin'}</div>
          <div className="admin-sidebar__user-role">{roleLabel}</div>
          <NavLink
            to="/account"
            className={({ isActive }) =>
              `admin-sidebar__account${isActive ? ' admin-sidebar__account--active' : ''}`
            }
          >
            Account settings
          </NavLink>
          <button type="button" className="admin-sidebar__logout" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-header">
          <div className="admin-header__search">
            <GlobalSearch />
          </div>
        </header>
        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
