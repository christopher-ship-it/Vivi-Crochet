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
  | 'health'
  | 'course'
  | 'orders'
  | 'calendar'
  | 'team'
  | 'payments'
  | 'lock'
  | 'settings'
  | 'logout';

const ICON_PATHS: Record<IconName, string> = {
  dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  shop: 'M6 7h12l-1 13H7L6 7zM9 7a3 3 0 0 1 6 0',
  customers: 'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.15a3.5 3.5 0 0 1 0 6.7',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  support: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
  health: 'M3 12h4l3-8 4 16 3-8h4',
  course: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5',
  orders: 'M4 4h16v16H4zM8 9h8M8 13h8M8 17h5',
  calendar: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4',
  payments: 'M3 6h18v12H3zM3 10h18M7 15h3',
  team: 'M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z',
  lock: 'M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
};

const COLLAPSE_KEY = 'vivi_admin_sidebar_collapsed';

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

function saveCollapsed(value: boolean): void {
  try {
    localStorage.setItem(COLLAPSE_KEY, value ? '1' : '0');
  } catch {
    // Storage can be blocked; the sidebar still works, it just won't remember the choice.
  }
}

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
  { to: '/payments', label: 'Payments', icon: 'payments' },
  { to: '/customers', label: 'Customers', icon: 'customers' },
  { to: '/notifications', label: 'Notifications', icon: 'bell' },
  { to: '/support', label: 'Support', icon: 'support' },
  { to: '/app-health', label: 'App health', icon: 'health' },
];

const COURSE_DASHBOARD_ITEMS = [
  { to: '/live', label: 'Live classes', end: true },
  { to: '/live/settings', label: 'Live settings' },
  { to: '/courses', label: 'Courses & videos' },
  { to: '/categories', label: 'Categories' },
  { to: '/special-offers', label: 'Special Offers', end: true },
  { to: '/special-offers/students', label: 'Student offers' },
  { to: '/viral-projects', label: 'Viral Projects' },
];

const ORDER_ITEMS = [
  { to: '/orders', label: 'Product orders' },
  { to: '/course-orders', label: 'Course & video orders' },
];

const BOOKING_ITEMS = [
  { to: '/live-bookings', label: 'Live Class Bookings' },
];

const DISABLED_NAV = ['Production', 'Audit log'];

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
    pathname.startsWith('/categories/') ||
    pathname === '/special-offers' ||
    pathname.startsWith('/special-offers/') ||
    pathname === '/viral-projects' ||
    pathname.startsWith('/viral-projects/')
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
  const [collapsed, setCollapsed] = useState(loadCollapsed);

  function setSidebarCollapsed(next: boolean) {
    setCollapsed(next);
    saveCollapsed(next);
  }

  /** In the icon-only rail a group has no room for its items, so tapping it opens the sidebar. */
  function toggleGroup(setOpen: (update: (open: boolean) => boolean) => void) {
    if (collapsed) {
      setSidebarCollapsed(false);
      setOpen(() => true);
      return;
    }
    setOpen((open) => !open);
  }

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
      <aside className={`admin-sidebar${collapsed ? ' admin-sidebar--collapsed' : ''}`}>
        <div className="admin-sidebar__brand">
          <img src="/vivi-logo.png" alt="VIVI Crochet" className="admin-sidebar__logo" />
          <div className="admin-sidebar__brand-copy">
            <div className="admin-sidebar__name">VIVI Admin</div>
            <div className="admin-sidebar__tag">Console</div>
          </div>
          <button
            type="button"
            className="admin-sidebar__collapse"
            onClick={() => setSidebarCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d={collapsed ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'} />
            </svg>
          </button>
        </div>

        <nav className="admin-nav" aria-label="Main">
          <div className="admin-nav__section">Menu</div>

          {NAV_ITEMS.slice(0, 1).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={collapsed ? item.label : undefined}
              aria-label={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                `admin-nav__link${isActive ? ' admin-nav__link--active' : ''}`
              }
            >
              <span className="admin-nav__link-label">
                <NavIcon name={item.icon} />
                <span className="admin-nav__text">{item.label}</span>
              </span>
            </NavLink>
          ))}

          <div className="admin-nav__group">
            <button
              type="button"
              className={`admin-nav__group-toggle${courseDashActive ? ' admin-nav__group-toggle--active' : ''}${courseDashOpen && !collapsed ? ' admin-nav__group-toggle--open' : ''}`}
              aria-expanded={courseDashOpen && !collapsed}
              title={collapsed ? 'Course dashboard' : undefined}
              aria-label={collapsed ? 'Course dashboard' : undefined}
              onClick={() => toggleGroup(setCourseDashOpen)}
            >
              <span className="admin-nav__link-label">
                <NavIcon name="course" />
                <span className="admin-nav__text">Course dashboard</span>
              </span>
              <span className="admin-nav__chevron" aria-hidden>
                ▾
              </span>
            </button>
            {courseDashOpen && !collapsed ? (
              <div className="admin-nav__group-items">
                {COURSE_DASHBOARD_ITEMS.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={'end' in item ? item.end : undefined}
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
              className={`admin-nav__group-toggle${ordersActive ? ' admin-nav__group-toggle--active' : ''}${ordersOpen && !collapsed ? ' admin-nav__group-toggle--open' : ''}`}
              aria-expanded={ordersOpen && !collapsed}
              title={collapsed ? 'Orders' : undefined}
              aria-label={collapsed ? 'Orders' : undefined}
              onClick={() => toggleGroup(setOrdersOpen)}
            >
              <span className="admin-nav__link-label">
                <NavIcon name="orders" />
                <span className="admin-nav__text">Orders</span>
              </span>
              <span className="admin-nav__chevron" aria-hidden>
                ▾
              </span>
            </button>
            {ordersOpen && !collapsed ? (
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
              className={`admin-nav__group-toggle${bookingsActive ? ' admin-nav__group-toggle--active' : ''}${bookingsOpen && !collapsed ? ' admin-nav__group-toggle--open' : ''}`}
              aria-expanded={bookingsOpen && !collapsed}
              title={collapsed ? 'Bookings' : undefined}
              aria-label={collapsed ? 'Bookings' : undefined}
              onClick={() => toggleGroup(setBookingsOpen)}
            >
              <span className="admin-nav__link-label">
                <NavIcon name="calendar" />
                <span className="admin-nav__text">Bookings</span>
              </span>
              <span className="admin-nav__chevron" aria-hidden>
                ▾
              </span>
            </button>
            {bookingsOpen && !collapsed ? (
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
              title={collapsed ? item.label : undefined}
              aria-label={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                `admin-nav__link${isActive ? ' admin-nav__link--active' : ''}`
              }
            >
              <span className="admin-nav__link-label">
                <NavIcon name={item.icon} />
                <span className="admin-nav__text">{item.label}</span>
                {item.to === '/support' && supportUnread > 0 ? (
                  <span
                    className="admin-nav__badge"
                    aria-label={`${supportUnread} unread`}
                    title={collapsed ? `${supportUnread} unread support queries` : undefined}
                  >
                    {supportUnread > 99 ? '99+' : supportUnread}
                  </span>
                ) : null}
              </span>
            </NavLink>
          ))}

          {isFullAdmin ? (
            <NavLink
              to="/team"
              title={collapsed ? 'Team users' : undefined}
              aria-label={collapsed ? 'Team users' : undefined}
              className={({ isActive }) =>
                `admin-nav__link${isActive ? ' admin-nav__link--active' : ''}`
              }
            >
              <span className="admin-nav__link-label">
                <NavIcon name="team" />
                <span className="admin-nav__text">Team users</span>
              </span>
            </NavLink>
          ) : null}

          {DISABLED_NAV.length > 0 ? <div className="admin-nav__section">Coming soon</div> : null}
          {DISABLED_NAV.map((label) => (
            <span
              key={label}
              className="admin-nav__link admin-nav__link--disabled"
              title={collapsed ? label : undefined}
            >
              <span className="admin-nav__link-label">
                <NavIcon name="lock" />
                <span className="admin-nav__text">{label}</span>
              </span>
            </span>
          ))}
        </nav>

        <div className="admin-sidebar__user">
          <div className="admin-sidebar__user-row">
            <span className="admin-sidebar__avatar" aria-hidden>
              {(user?.name ?? 'Admin').trim().charAt(0).toUpperCase() || 'A'}
            </span>
            <div className="admin-sidebar__user-copy" title={user?.name ?? 'Admin'}>
              <div className="admin-sidebar__user-name">{user?.name ?? 'Admin'}</div>
              <div className="admin-sidebar__user-role">{roleLabel}</div>
            </div>
          </div>
          <NavLink
            to="/account"
            title={collapsed ? 'Account settings' : undefined}
            aria-label={collapsed ? 'Account settings' : undefined}
            className={({ isActive }) =>
              `admin-sidebar__account${isActive ? ' admin-sidebar__account--active' : ''}`
            }
          >
            <span className="admin-sidebar__icon-only" aria-hidden>
              <NavIcon name="settings" />
            </span>
            <span className="admin-nav__text">Account settings</span>
          </NavLink>
          <button
            type="button"
            className="admin-sidebar__logout"
            onClick={logout}
            title={collapsed ? 'Sign out' : undefined}
            aria-label={collapsed ? 'Sign out' : undefined}
          >
            <span className="admin-sidebar__icon-only" aria-hidden>
              <NavIcon name="logout" />
            </span>
            <span className="admin-nav__text">Sign out</span>
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
