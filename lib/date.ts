/**
 * Date nesnesini YEREL tarihe göre YYYY-MM-DD'ye çevirir.
 * toISOString() UTC'ye çevirdiği için gece saatlerinde günü kaydırabiliyor —
 * bu yüzden entry tarihleri için bunu kullanıyoruz, toISOString değil.
 */
export function toLocalDateKey(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Verilen tarihin ait olduğu haftanın Pazartesi gününü döner (haftalar Pazartesi başlar) */
export function getMondayOfWeek(d: Date) {
  const day = d.getDay(); // 0=Pazar..6=Cumartesi
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export const MONTH_NAMES = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

/**
 * Hafta şeridinin başlığı: aynı ay içindeyse "13 – 19 Temmuz", ay atlıyorsa
 * "29 Haziran – 5 Temmuz".
 *
 * Tarih anahtarlarını (YYYY-MM-DD) elle parçalıyoruz: new Date("2026-07-13")
 * anahtarı UTC gece yarısı sayar ve negatif saat dilimlerinde günü bir gün
 * geriye kaydırır — toLocalDateKey'in kaçındığı hatanın aynısı.
 */
export function formatWeekRange(startKey: string, endKey: string) {
  const [, startMonth, startDay] = startKey.split("-");
  const [, endMonth, endDay] = endKey.split("-");
  const endMonthName = MONTH_NAMES[Number(endMonth) - 1];
  if (startMonth === endMonth) {
    return `${Number(startDay)} – ${Number(endDay)} ${endMonthName}`;
  }
  return `${Number(startDay)} ${MONTH_NAMES[Number(startMonth) - 1]} – ${Number(endDay)} ${endMonthName}`;
}

const WEEKDAY_LETTERS: Record<number, string> = {
  1: "P", // Pazartesi
  2: "S", // Salı
  3: "Ç", // Çarşamba
  4: "P", // Perşembe
  5: "C", // Cuma
  6: "C", // Cumartesi
  0: "P", // Pazar
};

export function weekdayLetter(d: Date) {
  return WEEKDAY_LETTERS[d.getDay()];
}
