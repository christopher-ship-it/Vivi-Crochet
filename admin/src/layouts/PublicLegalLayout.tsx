import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';

export function PublicLegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="legal-page">
      <header className="legal-page__header">
        <Link to="/privacy-policy" className="legal-page__brand">
          <img src="/vivi-logo.png" alt="" className="legal-page__logo" />
          <div>
            <div className="legal-page__brand-name">VIVI Crochet</div>
            <div className="legal-page__brand-tag">Customer information</div>
          </div>
        </Link>
        <nav className="legal-page__nav" aria-label="Legal">
          <NavLink
            to="/privacy-policy"
            className={({ isActive }) =>
              `legal-page__nav-link${isActive ? ' legal-page__nav-link--active' : ''}`
            }
          >
            Privacy policy
          </NavLink>
          <NavLink
            to="/delete-account"
            className={({ isActive }) =>
              `legal-page__nav-link${isActive ? ' legal-page__nav-link--active' : ''}`
            }
          >
            Delete account
          </NavLink>
        </nav>
      </header>
      <main className="legal-page__main">{children}</main>
      <footer className="legal-page__footer">
        <a href="mailto:support@vivicrochet01.com">support@vivicrochet01.com</a>
        <span aria-hidden>·</span>
        <span>© {new Date().getFullYear()} VIVI Crochet</span>
      </footer>
    </div>
  );
}
