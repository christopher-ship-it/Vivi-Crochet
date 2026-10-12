import { UserMetricsSection } from '../components/UserMetricsSection';

export function UserMetricsPage() {
  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-header__title">Daily user metrics</h1>
          <p className="page-header__subtitle">Daily sign-ups, active users and totals for each kind of paid access</p>
        </div>
      </header>
      <UserMetricsSection />
    </>
  );
}
