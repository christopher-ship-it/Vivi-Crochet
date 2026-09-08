import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/orders', label: 'Orders' },
  { to: '/live', label: 'Live classes' },
  { to: '/courses', label: 'Courses & videos' },
  { to: '/products', label: 'Shop products' },
  { to: '/categories', label: 'Categories' },
];

const DISABLED_NAV = [
  'Production',
  'Customers',
  'Payments',
  'Audit log',
];

export function AdminLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-sidebar__brand">
          <img src="/favicon.svg" alt="" className="admin-sidebar__logo" />
          <div>
            <div className="admin-sidebar__name">VIVI Admin</div>
            <div className="admin-sidebar__tag">Console</div>
          </div>
        </div>

        <nav className="admin-nav" aria-label="Main">
          <div className="admin-nav__section">Menu</div>
          {NAV_ITEMS.map((item) => (
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
          {DISABLED_NAV.map((label) => (
            <span key={label} className="admin-nav__link admin-nav__link--disabled">
              {label}
            </span>
          ))}
        </nav>

        <div className="admin-sidebar__user">
          <div className="admin-sidebar__user-name">{user?.name ?? 'Admin'}</div>
          <div className="admin-sidebar__user-role">Owner · full access</div>
          <button type="button" className="admin-sidebar__logout" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-header">
          <div className="admin-header__search">
            <input type="search" placeholder="Search (coming soon)" disabled aria-label="Search" />
          </div>
        </header>
        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
