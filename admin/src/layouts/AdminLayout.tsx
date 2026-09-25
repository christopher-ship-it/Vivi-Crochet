import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { getSupportUnreadCount } from '../api/support';
import { useAuth } from '../auth/AuthContext';
import { GlobalSearch } from '../components/GlobalSearch';

type IconName =
  | 'dashboard'
  | 'shop'
  | 'customers'
  | 'bell'
  | 'support'
  | 'course'
  | 'orders'
  | 'calendar'
  | 'team'
  | 'lock';

const ICON_PATHS: Record<IconName, string> = {
  dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  shop: 'M6 7h12l-1 13H7L6 7zM9 7a3 3 0 0 1 6 0',
  customers: 'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.15a3.5 3.5 0 0 1 0 6.7',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  support: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
  course: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5',
  orders: 'M4 4h16v16H4zM8 9h8M8 13h8M8 17h5',
  calendar: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4',
  team: 'M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z',
  lock: 'M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3',
};

function NavIcon({ name }: { name: IconName }) {
  return (
    <svg
      className="admin-nav__icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

const NAV_ITEMS: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
  { to: '/products', label: 'Shop products', icon: 'shop' },
  { to: '/customers', label: 'Customers', icon: 'customers' },
  { to: '/notifications', label: 'Notifications', icon: 'bell' },
  { to: '/support', label: 'Support', icon: 'support' },
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
  // Focused create screens skip the global search bar to keep the form on one screen.
  const hideSearchHeader =
    ['/courses/new', '/products/new', '/live'].includes(location.pathname) ||
    /^\/orders\/[^/]+$/.test(location.pathname);
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
              <span className="admin-nav__link-label">
                <NavIcon name={item.icon} />
                {item.label}
              </span>
            </NavLink>
          ))}

          <div className="admin-nav__group">
            <button
              type="button"
              className={`admin-nav__group-toggle${courseDashActive ? ' admin-nav__group-toggle--active' : ''}${courseDashOpen ? ' admin-nav__group-toggle--open' : ''}`}
              aria-expanded={courseDashOpen}
              onClick={() => setCourseDashOpen((open) => !open)}
            >
              <span className="admin-nav__link-label">
                <NavIcon name="course" />
                Course dashboard
              </span>
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
              <span className="admin-nav__link-label">
                <NavIcon name="orders" />
                Orders
              </span>
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
              <span className="admin-nav__link-label">
                <NavIcon name="calendar" />
                Bookings
              </span>
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
                <NavIcon name={item.icon} />
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
              <span className="admin-nav__link-label">
                <NavIcon name="team" />
                Team users
              </span>
            </NavLink>
          ) : null}

          {DISABLED_NAV.length > 0 ? <div className="admin-nav__section">Coming soon</div> : null}
          {DISABLED_NAV.map((label) => (
            <span key={label} className="admin-nav__link admin-nav__link--disabled">
              <span className="admin-nav__link-label">
                <NavIcon name="lock" />
                {label}
              </span>
            </span>
          ))}
        </nav>

        <div className="admin-sidebar__user">
          <div className="admin-sidebar__user-row">
            <span className="admin-sidebar__avatar" aria-hidden>
              {(user?.name ?? 'Admin').trim().charAt(0).toUpperCase() || 'A'}
            </span>
            <div className="admin-sidebar__user-copy">
              <div className="admin-sidebar__user-name">{user?.name ?? 'Admin'}</div>
              <div className="admin-sidebar__user-role">{roleLabel}</div>
            </div>
          </div>
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
        {hideSearchHeader ? null : (
          <header className="admin-header">
            <div className="admin-header__search">
              <GlobalSearch />
            </div>
          </header>
        )}
        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
