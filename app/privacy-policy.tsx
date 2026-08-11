import { LegalScreen } from "@/components/LegalScreen";
import privacy from "@/lib/legal/privacy.json";

/**
 * Metin bu dosyada DEĞİL, lib/legal/privacy.json'da.
 *
 * NEDEN: Play Console, gizlilik politikasının uygulama DIŞINDAN erişilebilen bir
 * adreste de yayımlanmasını şart koşuyor (docs/ altındaki sayfalar,
 * `npm run gen:legal` ile üretiliyor). İki kopya olsaydı biri güncellenip
 * diğeri unutulurdu ve mağazadaki politika ile uygulamadaki metin ayrışırdı —
 * bu, uygulamanın yayından kaldırılma sebebi. Tek kaynak bunu yapısal olarak
 * imkânsız kılıyor; CI da üretilen HTML'in güncel olduğunu doğruluyor.
 */
export default function PrivacyPolicyScreen() {
  return (
    <LegalScreen
      title={privacy.title}
      updatedAt={privacy.updatedAt}
      sections={privacy.sections}
    />
  );
}
