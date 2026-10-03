import { LegalDocumentScreen } from '../src/components/LegalDocumentScreen';
import { AUTHENTICITY_DOCUMENT } from '../src/legal/documents';

export default function AuthenticityScreen() {
  return <LegalDocumentScreen document={AUTHENTICITY_DOCUMENT} />;
}
