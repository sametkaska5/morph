/**
 * Gün kutusuna basınca dönen 3 durumlu döngü:
 *   boş → off_day (bilinçli dinlenme) → workout (spor yapıldı ama foto çekilmedi,
 *   off day sayılmasın istendi) → boş.
 *
 * "log" (fotoğraflı gerçek kayıt) bu döngünün DIŞINDA — o ayrı bir akıştan
 * (kayıt ekranı) gelir; buraya current olarak "log" gelmesi beklenmez, gelse de
 * döngü onu "boş" gibi ele alıp off_day'e geçer (güvenli varsayılan).
 *
 * İstatistikler ekranından çıkarıldı ki saf döngü mantığı birim testle
 * kilitlenebilsin (ekranı import etmeden).
 */
export function nextOffDayState(current: string | null): "off_day" | "workout" | null {
  if (current === "off_day") return "workout";
  if (current === "workout") return null;
  return "off_day";
}
