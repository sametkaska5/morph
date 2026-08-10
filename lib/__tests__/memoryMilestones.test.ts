import {
  pickMemoryMilestones,
  MAX_MEMORY_NOTIFICATIONS,
  MILESTONE_MONTHS,
  type MemoryEntry,
} from "../memoryMilestones";

/**
 * "X ay önce bugün" bildirimlerinin seçimi.
 *
 * Bu fonksiyon var çünkü eskiden HER kayıt için 4 bildirim kuruluyordu ve sayı
 * kayıt sayısıyla doğrusal büyüyordu. iOS'un 64 bekleyen bildirim sınırı sert:
 * aşınca fazlası SESSİZCE atılıyor ve hangisinin atıldığını seçemiyoruz —
 * günlük hatırlatma bile kurban olabiliyor. Testler sınırın gerçekten
 * tutduğunu ve en yakın bildirimlerin öncelikli olduğunu koruyor.
 */

const NOW = new Date(2026, 7, 4, 12, 0, 0); // 4 Ağustos 2026, öğlen
const TIME = "20:00:00";

/** i gün ÖNCE oluşturulmuş bir kayıt. */
function entryDaysAgo(id: string, days: number): MemoryEntry {
  const d = new Date(NOW);
  d.setDate(d.getDate() - days);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { id, date: key, note: null };
}

describe("pickMemoryMilestones — sınır", () => {
  it("çok sayıda kayıtta bile üst sınırı aşmaz", () => {
    // 40 kayıt × 4 kilometre taşı = 160 aday. Sınır olmasaydı hepsi kurulur
    // ve iOS sessizce çoğunu atardı.
    const entries = Array.from({ length: 40 }, (_, i) => entryDaysAgo(`e${i}`, i + 1));

    const picked = pickMemoryMilestones(entries, TIME, NOW);

    expect(picked.length).toBe(MAX_MEMORY_NOTIFICATIONS);
  });

  it("aday sayısı sınırın altındaysa hepsini döner", () => {
    const entries = [entryDaysAgo("e1", 10)];

    const picked = pickMemoryMilestones(entries, TIME, NOW);

    expect(picked.length).toBe(MILESTONE_MONTHS.length);
  });

  it("EN YAKIN tarihleri seçer, rastgele bir alt küme değil", () => {
    // Sıralama olmasaydı uzaktaki bir bildirim bütçeyi yer, yakındaki kaçardı.
    const entries = Array.from({ length: 20 }, (_, i) => entryDaysAgo(`e${i}`, i + 1));

    const picked = pickMemoryMilestones(entries, TIME, NOW, 5);
    const times = picked.map((p) => p.date.getTime());

    expect([...times].sort((a, b) => a - b)).toEqual(times); // artan sırada
    // Seçilenlerin en geç olanı, seçilmeyenlerin en erkeninden önce olmalı.
    const all = pickMemoryMilestones(entries, TIME, NOW, Number.MAX_SAFE_INTEGER);
    const rest = all.slice(5).map((p) => p.date.getTime());
    expect(Math.max(...times)).toBeLessThanOrEqual(Math.min(...rest));
  });

  it("limit 0 verilirse hiçbir şey döndürmez", () => {
    const entries = [entryDaysAgo("e1", 10)];
    expect(pickMemoryMilestones(entries, TIME, NOW, 0)).toEqual([]);
  });
});

describe("pickMemoryMilestones — tarih hesabı", () => {
  it("geçmişte kalan kilometre taşlarını eler", () => {
    // 13 ay önceki kayıt: 1/3/6/12 aylık dönümlerinin HEPSİ geçmişte.
    const entries = [entryDaysAgo("eski", 400)];

    expect(pickMemoryMilestones(entries, TIME, NOW)).toEqual([]);
  });

  it("hatırlatma saatini uygular", () => {
    const entries = [entryDaysAgo("e1", 10)];

    const [first] = pickMemoryMilestones(entries, "07:30:00", NOW);

    expect(first.date.getHours()).toBe(7);
    expect(first.date.getMinutes()).toBe(30);
  });

  it("yıldönümü BUGÜNSE ve saat geçmişse o taşı eler", () => {
    // Saat kontrolü gece yarısıyla yapılsaydı bu bildirim "gelecek" sayılır,
    // sonra saat geçmişe düşer ve ya anında tetiklenir ya hiç kurulmazdı.
    const oneMonthAgo = new Date(NOW);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const key = `${oneMonthAgo.getFullYear()}-${String(oneMonthAgo.getMonth() + 1).padStart(2, "0")}-${String(oneMonthAgo.getDate()).padStart(2, "0")}`;
    const entries: MemoryEntry[] = [{ id: "e1", date: key, note: null }];

    // NOW öğlen 12:00; hatırlatma 09:00 → bugünkü 1 aylık dönüm çoktan geçmiş.
    const picked = pickMemoryMilestones(entries, "09:00:00", NOW);

    expect(picked.some((p) => p.months === 1)).toBe(false);
    // 3/6/12 aylıklar hâlâ gelecekte, onlar durmalı.
    expect(picked.some((p) => p.months === 3)).toBe(true);
  });

  it("tarih anahtarını YEREL okur — saat dilimi günü kaydırmaz", () => {
    // new Date("2026-08-01") UTC gece yarısıdır; negatif saat diliminde
    // getDate() 31 döner ve dönüm bir gün geriye kayardı.
    const entries: MemoryEntry[] = [{ id: "e1", date: "2026-08-01", note: null }];

    const [first] = pickMemoryMilestones(entries, TIME, NOW);

    expect(first.date.getDate()).toBe(1);
  });

  it("kaydın notunu bildirime taşır", () => {
    const entries: MemoryEntry[] = [{ id: "e1", date: "2026-08-01", note: "harika gündü" }];

    expect(pickMemoryMilestones(entries, TIME, NOW)[0].note).toBe("harika gündü");
  });
});

describe("pickMemoryMilestones — kararlılık", () => {
  it("aynı girdiyle aynı sonucu verir", () => {
    // Kararsız olsaydı her açılışta farklı bir alt küme seçilir, bildirimler
    // boş yere iptal edilip yeniden kurulurdu.
    const entries = Array.from({ length: 15 }, (_, i) => entryDaysAgo(`e${i}`, i + 1));

    const a = pickMemoryMilestones(entries, TIME, NOW).map((m) => `${m.entryId}-${m.months}`);
    const b = pickMemoryMilestones(entries, TIME, NOW).map((m) => `${m.entryId}-${m.months}`);

    expect(a).toEqual(b);
  });

  it("kayıt sırası değişse de aynı kümeyi seçer", () => {
    const entries = Array.from({ length: 15 }, (_, i) => entryDaysAgo(`e${i}`, i + 1));
    const shuffled = [...entries].reverse();

    const a = pickMemoryMilestones(entries, TIME, NOW).map((m) => `${m.entryId}-${m.months}`);
    const b = pickMemoryMilestones(shuffled, TIME, NOW).map((m) => `${m.entryId}-${m.months}`);

    expect(a).toEqual(b);
  });
});

/**
 * Saat doğrulanmadan kullanılırsa `setHours(NaN)` "Invalid Date" üretiyor ve
 * `target <= now` karşılaştırması NaN yüzünden hep false kalıyor — yani geçersiz
 * tarihli milestone'lar listeye giriyor ve zamanlama çağrısında patlıyor.
 * Geçersiz saatte hiç üretmemek doğru davranış (bkz. lib/date.ts parseReminderTime).
 */
describe("pickMemoryMilestones — geçersiz hatırlatma saati", () => {
  // 25 gün önceki kayıt: 1 aylık kilometre taşı henüz GELECEKTE, yani geçerli
  // saatle en az bir aday üretmesi gerekiyor.
  const entries = [entryDaysAgo("e1", 25)];

  it("bozuk saatte hiç milestone üretmez (Invalid Date sızdırmaz)", () => {
    for (const bad of ["", "abc", "24:00", "21:60", "21"]) {
      expect(pickMemoryMilestones(entries, bad, NOW)).toEqual([]);
    }
  });

  it("geçerli saatte normal çalışmaya devam eder", () => {
    const result = pickMemoryMilestones(entries, TIME, NOW);

    expect(result.length).toBeGreaterThan(0);
    for (const m of result) {
      expect(Number.isNaN(m.date.getTime())).toBe(false);
    }
  });
});
