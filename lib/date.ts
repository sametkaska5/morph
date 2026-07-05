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
