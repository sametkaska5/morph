/**
 * Bir gün kutusuna dokunulduğunda gidilecek route — hafta şeridi (istatistikler)
 * ve yıllık takvim aynı kuralı paylaşsın diye tek yerde.
 *
 * Kural: fotoğraflı gün kendi kaydını açar; diğer her gün (boş / off_day /
 * workout) fotoğrafsız gün ekranını O TARİHLE açar — geçmişe dönük off day ve
 * antrenman işaretlemesi oradaki seçimle yapılıyor. Gelecek günler `null`, yani
 * dokunma yok.
 */
export type DayRouteInput = {
  date: string;
  id: string | null;
  type: string | null;
  isFuture: boolean;
};

export function dayRoute(day: DayRouteInput): string | null {
  if (day.isFuture) return null;
  if (day.type === "log" && day.id) return `/entry/${day.id}`;
  return `/entry/workout?date=${day.date}`;
}
