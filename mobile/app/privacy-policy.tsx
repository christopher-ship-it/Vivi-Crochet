import { LegalDocumentScreen } from '../src/components/LegalDocumentScreen';
import { PRIVACY_DOCUMENT } from '../src/legal/documents';

export default function PrivacyPolicyScreen() {
  return <LegalDocumentScreen document={PRIVACY_DOCUMENT} />;
}
