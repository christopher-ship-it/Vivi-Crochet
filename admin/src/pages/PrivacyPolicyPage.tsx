import { useEffect } from 'react';
import { LegalDocumentView } from '../components/LegalDocumentView';
import { PublicLegalLayout } from '../layouts/PublicLegalLayout';
import { PRIVACY_DOCUMENT } from '../legal/documents';

export function PrivacyPolicyPage() {
  useEffect(() => {
    document.title = 'Privacy Policy · VIVI Crochet';
  }, []);

  return (
    <PublicLegalLayout>
      <LegalDocumentView document={PRIVACY_DOCUMENT} />
    </PublicLegalLayout>
  );
}
