import { LegalScreen } from "@/components/LegalScreen";
import terms from "@/lib/legal/terms.json";

/** Metin lib/legal/terms.json'da — gerekçesi için bkz. privacy-policy.tsx. */
export default function TermsScreen() {
  return <LegalScreen title={terms.title} updatedAt={terms.updatedAt} sections={terms.sections} />;
}
