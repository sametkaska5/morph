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
