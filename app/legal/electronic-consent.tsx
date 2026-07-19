import { LegalDocumentScreen } from '@/components/LegalDocumentScreen';
import { getLegalDocument } from '@/lib/legal';

export default function ElectronicConsentScreen() {
  const document = getLegalDocument('electronicConsent');

  return (
    <LegalDocumentScreen
      title={document.title}
      effectiveDateLabel={document.effectiveDateLabel}
      intro={document.intro}
      sections={document.sections}
      version={document.version}
    />
  );
}
