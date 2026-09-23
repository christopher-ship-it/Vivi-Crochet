import { LegalDocumentScreen } from '../src/components/LegalDocumentScreen';
import { TERMS_DOCUMENT } from '../src/legal/documents';

export default function TermsScreen() {
  return <LegalDocumentScreen document={TERMS_DOCUMENT} />;
}
