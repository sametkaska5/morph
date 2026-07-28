/**
 * Ölçüm girdisi (kullanıcının yazdığı ham metin) → temiz sayı ya da null.
 *
 * Aynı parse mantığı eskiden üç ayrı yerde (new.tsx, edit/[id].tsx,
 * entryMutations.saveEntry) elle kopyalanmıştı ve hepsinde tutarlı değildi:
 * düzenleme ekranında NaN kontrolü yoktu, yani "abc" gibi bir girdi
 * parseFloat -> NaN üretip toMetricValue üzerinden DB'ye NaN olarak yazılabiliyordu.
 * Tek kapıdan geçirince geçersiz değer HİÇBİR zaman DB'ye ulaşmıyor.
 *
 * - Ondalık ayırıcı olarak virgülü de kabul eder (Türkçe klavye "1,5" yazar).
 * - Boş / sayısal olmayan / sonlu olmayan (NaN, Infinity) girdilerde null döner.
 *   Çağıran taraf null'ları atlar; böylece "geçersiz" ile "boş" aynı güvenli
 *   sonuca (yazma) varır.
 */
export function parseMeasurementInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const num = parseFloat(trimmed.replace(",", "."));
  if (!Number.isFinite(num)) return null;
  return num;
}

/**
 * Formlarda kullanılan ZENGİN doğrulama. parseMeasurementInput sadece "sayı mı"
 * diye bakar; bu ise kullanıcıya neden geçersiz olduğunu söyleyebilmek ve makul
 * olmayan (negatif / saçma yüksek) değerleri kayıttan önce engellemek için
 * durumu ayrıntılı döndürür.
 *
 * `displayUnit`: değerin GÖSTERİM birimi (kg/lb/cm/in/%). Üst sınır buna göre
 * seçilir — kilo 1000, boy 400 gibi. Bilinmeyen/özel birimlerde yalnızca bariz
 * çöpü (yazım hatası) eleyen çok yüksek bir genel sınır uygulanır.
 */
export const MEASUREMENT_MAX_BY_UNIT: Record<string, number> = {
  kg: 1000,
  lb: 2200,
  cm: 400,
  in: 160,
  "%": 100,
};
/** Bilinmeyen/özel birimler için: sadece açıkça saçma (yazım hatası) değerleri ele. */
export const MEASUREMENT_GENERIC_MAX = 1_000_000;

export type MeasurementValidation =
  | { status: "empty" | "invalid" | "negative"; value: null }
  | { status: "too_high"; value: null; max: number }
  | { status: "ok"; value: number };

export function validateMeasurementInput(raw: string, displayUnit?: string): MeasurementValidation {
  const trimmed = raw.trim();
  if (trimmed === "") return { status: "empty", value: null };
  const num = parseFloat(trimmed.replace(",", "."));
  if (!Number.isFinite(num)) return { status: "invalid", value: null };
  if (num < 0) return { status: "negative", value: null };
  const max =
    displayUnit && displayUnit in MEASUREMENT_MAX_BY_UNIT
      ? MEASUREMENT_MAX_BY_UNIT[displayUnit]
      : MEASUREMENT_GENERIC_MAX;
  if (num > max) return { status: "too_high", value: null, max };
  return { status: "ok", value: num };
}

/**
 * Doğrulama sonucundan kullanıcıya gösterilecek kısa uyarı metni. "empty" ve
 * "ok" için null (uyarı yok). new + edit ekranları aynı metinleri kullansın diye
 * burada tutuluyor.
 */
export function measurementErrorText(v: MeasurementValidation): string | null {
  switch (v.status) {
    case "invalid":
      return "Sayı gir";
    case "negative":
      return "Negatif olamaz";
    case "too_high":
      return `Çok yüksek (en fazla ${v.max})`;
    default:
      return null;
  }
}
