import { NavLink } from 'react-router-dom';

/** Switches between the launch offer and the student offer. */
export function OfferTabs() {
  const tab = ({ isActive }: { isActive: boolean }) => `tab${isActive ? ' tab--active' : ''}`;
  return (
    <nav className="tabs" aria-label="Offer type">
      <NavLink to="/special-offers" end className={tab} style={{ textDecoration: 'none' }}>
        Launch offer
      </NavLink>
      <NavLink to="/special-offers/students" className={tab} style={{ textDecoration: 'none' }}>
        Students
      </NavLink>
    </nav>
  );
}
