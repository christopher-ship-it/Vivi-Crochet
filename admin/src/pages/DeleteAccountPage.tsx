import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PublicLegalLayout } from '../layouts/PublicLegalLayout';

const LOSS_ITEMS = [
  {
    title: 'Purchased Courses & Learning Access',
    description:
      'You will lose access to your purchased courses, lessons, and learning progress.',
  },
  {
    title: 'Live Crochet Classes',
    description:
      'Your access to your live class bookings and related account information will be removed.',
  },
  {
    title: 'Orders & Order History',
    description: 'You will no longer be able to access your previous orders and order history.',
  },
  {
    title: 'VIVI Account',
    description: 'Your VIVI account and associated profile information will be deleted.',
  },
];

export function DeleteAccountPage() {
  useEffect(() => {
    document.title = 'Delete Account · VIVI Crochet';
  }, []);

  return (
    <PublicLegalLayout>
      <article className="legal-doc">
        <p className="legal-doc__eyebrow">VIVI CROCHET</p>
        <h1 className="legal-doc__title">Delete your account</h1>
        <p className="legal-doc__effective">How to permanently delete your VIVI Crochet account</p>

        <p className="legal-doc__paragraph legal-doc__paragraph--lead">
          You can delete your VIVI account from the mobile app, or by contacting support. Account
          deletion permanently removes access to your VIVI account and the features listed below.
        </p>

        <h2 className="legal-doc__heading">Delete from the VIVI app</h2>
        <ol className="legal-doc__steps">
          <li>Open the VIVI Crochet mobile app and sign in.</li>
          <li>Go to Profile.</li>
          <li>Open Profile settings.</li>
          <li>Tap Delete account and confirm.</li>
        </ol>

        <h2 className="legal-doc__heading">Request deletion by email</h2>
        <p className="legal-doc__paragraph">
          If you cannot use the in-app flow, email{' '}
          <a href="mailto:support@vivicrochet01.com">support@vivicrochet01.com</a> from the
          email or phone number associated with your account and ask us to delete it. We will
          verify your identity and process the request.
        </p>

        <h2 className="legal-doc__heading">What you will lose</h2>
        <p className="legal-doc__paragraph">
          We're sad to see you go. Before you continue, please note that deleting your account
          will permanently remove your access to your VIVI account and the following features:
        </p>
        <ul className="legal-doc__loss-list">
          {LOSS_ITEMS.map((item) => (
            <li key={item.title}>
              <strong>{item.title}</strong>
              <span>{item.description}</span>
            </li>
          ))}
        </ul>

        <h2 className="legal-doc__heading">Data we may retain</h2>
        <p className="legal-doc__paragraph">
          Some information may be retained where required or permitted by applicable law,
          including records needed for legal, accounting, security, fraud-prevention, or
          transaction purposes. See our{' '}
          <Link to="/privacy-policy">Privacy Policy</Link> for details.
        </p>

        <h2 className="legal-doc__heading">Contact</h2>
        <ul className="legal-doc__bullets">
          <li>
            Email:{' '}
            <a href="mailto:support@vivicrochet01.com">support@vivicrochet01.com</a>
          </li>
          <li>India phone: +91 8754112435</li>
        </ul>
      </article>
    </PublicLegalLayout>
  );
}
