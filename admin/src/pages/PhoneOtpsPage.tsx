import { OtpStatsSection } from '../components/OtpStatsSection';

export function PhoneOtpsPage() {
  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-header__title">Phone OTPs</h1>
          <p className="page-header__subtitle">Sign-in codes the app has sent to phone numbers, including past ones</p>
        </div>
      </header>
      <OtpStatsSection />
    </>
  );
}
