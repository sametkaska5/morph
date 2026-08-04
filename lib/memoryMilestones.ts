/**
 * "X ay önce bugün" bildirimlerinin HANGİLERİNİN zamanlanacağını seçer.
 *
 * Neden bir seçim gerekiyor: her kayıt için 4 kilometre taşı (1/3/6/12 ay)
 * kuruluyordu ve bu, kayıt sayısıyla DOĞRUSAL büyüyor — 14 kayıtta 52 bildirim,
 * 50 kayıtta 200. Oysa işletim sistemlerinin bekleyen bildirim sınırı var:
 * iOS'ta 64 (sert sınır, fazlası SESSİZCE atılır), Android'de üreticiye göre
 * değişen bir tavan. Sınır aşılınca hangi bildirimin düştüğünü kontrol
 * edemiyoruz — günlük hatırlatma bile kurbanlardan biri olabiliyor ve hiçbir
 * hata alınmıyor.
 *
 * Çözüm: hepsini değil, EN YAKIN olanları zamanla. Uzaktakiler zaten aylar
 * sonra; uygulama o zamana kadar defalarca açılacak ve liste her açılışta
 * tazelendiği için sıraları geldiğinde kurulacaklar.
 */

/** Kaç ay sonrası için hatırlatma kurulacağı. */
export const MILESTONE_MONTHS = [1, 3, 6, 12];

/**
 * Aynı anda kurulacak en fazla "geçmiş anı" bildirimi.
 *
 * iOS'un 64 sınırının epey altında: günlük hatırlatma ve seri uyarısı da aynı
 * bütçeden yiyor, ayrıca sınıra dayanmak yerine rahat bir pay bırakmak
 * istiyoruz. 30 bildirim pratikte aylarca yetiyor.
 */
export const MAX_MEMORY_NOTIFICATIONS = 30;

export type MemoryEntry = { id: string; date: string; note: string | null };

export type MemoryMilestone = {
  entryId: string;
  months: number;
  /** Bildirimin tetikleneceği an (yerel saat, reminderTime uygulanmış). */
  date: Date;
  note: string | null;
};

/**
 * Zamanlanacak kilometre taşlarını EN YAKINDAN başlayarak, `limit` tanesiyle
 * sınırlı olarak döner. Geçmişte kalanlar elenir.
 *
 * Saf fonksiyon: `now` dışarıdan geliyor ki test edilebilsin ve "bugün" kayması
 * yaşanmasın.
 */
export function pickMemoryMilestones(
  entries: MemoryEntry[],
  reminderTime: string,
  now: Date,
  limit: number = MAX_MEMORY_NOTIFICATIONS
): MemoryMilestone[] {
  const [hour, minute] = reminderTime.split(":").map(Number);
  const all: MemoryMilestone[] = [];

  for (const entry of entries) {
    // Tarih anahtarını (YYYY-MM-DD) elle parçalıyoruz: new Date("2026-07-13")
    // UTC gece yarısı sayılır ve negatif saat dilimlerinde günü kaydırır.
    const [year, month, day] = entry.date.split("-").map(Number);

    for (const months of MILESTONE_MONTHS) {
      const target = new Date(year, month - 1, day);
      target.setMonth(target.getMonth() + months);
      // Saati, geçmiş kontrolünden ÖNCE uygula: yıldönümü bugüne denk gelip
      // hatırlatma saati çoktan geçmişse, gece yarısıyla yapılan kontrol geçer
      // ama sonradan set edilen saat geçmişte kalırdı.
      target.setHours(hour, minute, 0, 0);
      if (target <= now) continue;

      all.push({ entryId: entry.id, months, date: target, note: entry.note });
    }
  }

  // En yakın tarih önce. Eşitlikte kayıt kimliğine göre kararlı sıralama —
  // aksi halde her çağrıda farklı bir alt küme seçilip bildirimler gereksiz
  // yere iptal edilip yeniden kurulurdu.
  all.sort(
    (a, b) =>
      a.date.getTime() - b.date.getTime() ||
      (a.entryId < b.entryId ? -1 : a.entryId > b.entryId ? 1 : a.months - b.months)
  );

  return all.slice(0, Math.max(0, limit));
}
