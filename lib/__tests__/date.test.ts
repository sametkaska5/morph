import {
  toLocalDateKey,
  getMondayOfWeek,
  weekdayLetter,
  formatWeekRange,
  parseLocalDate,
  formatDateKey,
} from "../date";

describe("toLocalDateKey", () => {
  it("YEREL tarihe göre YYYY-MM-DD üretir (UTC'ye kaymaz)", () => {
    // Yerel saatle gece yarısına yakın bir an: toISOString() UTC'ye çevirip
    // günü bir gün geri kaydırabilir — toLocalDateKey bunu yapmamalı.
    const d = new Date(2026, 0, 15, 1, 30); // 15 Ocak 2026, yerel 01:30
    expect(toLocalDateKey(d)).toBe("2026-01-15");
  });

  it("ay ve günü iki haneye sıfırla tamamlar", () => {
    const d = new Date(2026, 8, 3); // Eylül (index 8) = 09, gün 03
    expect(toLocalDateKey(d)).toBe("2026-09-03");
  });

  it("yıl sonu / ay sonu sınırını doğru verir", () => {
    expect(toLocalDateKey(new Date(2025, 11, 31))).toBe("2025-12-31");
  });
});

describe("getMondayOfWeek", () => {
  it("hafta içi bir günü o haftanın Pazartesi'sine götürür", () => {
    // 2026-07-22 Çarşamba -> aynı haftanın Pazartesi'si 2026-07-20
    const wed = new Date(2026, 6, 22);
    expect(toLocalDateKey(getMondayOfWeek(wed))).toBe("2026-07-20");
  });

  it("Pazar gününü BİR ÖNCEKİ Pazartesi'ye götürür (hafta Pazartesi başlar)", () => {
    // 2026-07-26 Pazar -> 2026-07-20 Pazartesi
    const sun = new Date(2026, 6, 26);
    expect(toLocalDateKey(getMondayOfWeek(sun))).toBe("2026-07-20");
  });

  it("Pazartesi gününü kendisi olarak bırakır", () => {
    const mon = new Date(2026, 6, 20);
    expect(toLocalDateKey(getMondayOfWeek(mon))).toBe("2026-07-20");
  });

  it("günün başına (00:00:00) sıfırlar", () => {
    const mon = getMondayOfWeek(new Date(2026, 6, 22, 15, 45, 30));
    expect(mon.getHours()).toBe(0);
    expect(mon.getMinutes()).toBe(0);
    expect(mon.getSeconds()).toBe(0);
    expect(mon.getMilliseconds()).toBe(0);
  });
});

describe("formatWeekRange", () => {
  it("aynı ay içindeki haftada ayı bir kez yazar", () => {
    expect(formatWeekRange("2026-07-13", "2026-07-19")).toBe("13 – 19 Temmuz");
  });

  it("ay atlayan haftada iki ayı da yazar", () => {
    expect(formatWeekRange("2026-06-29", "2026-07-05")).toBe("29 Haziran – 5 Temmuz");
  });

  it("yıl atlayan haftayı da doğru yazar", () => {
    expect(formatWeekRange("2025-12-29", "2026-01-04")).toBe("29 Aralık – 4 Ocak");
  });

  it("gün numaralarının başındaki sıfırı atar", () => {
    expect(formatWeekRange("2026-03-02", "2026-03-08")).toBe("2 – 8 Mart");
  });

  it("tarih anahtarını YEREL okur — saat dilimi günü kaydırmaz", () => {
    // new Date("2026-08-03") UTC gece yarısıdır; negatif saat diliminde
    // getDate() 2 döner ve aralık bir gün geriye kayardı.
    expect(formatWeekRange("2026-08-03", "2026-08-09")).toBe("3 – 9 Ağustos");
  });
});

describe("weekdayLetter", () => {
  it("her günün Türkçe baş harfini döner", () => {
    expect(weekdayLetter(new Date(2026, 6, 20))).toBe("P"); // Pazartesi
    expect(weekdayLetter(new Date(2026, 6, 21))).toBe("S"); // Salı
    expect(weekdayLetter(new Date(2026, 6, 22))).toBe("Ç"); // Çarşamba
    expect(weekdayLetter(new Date(2026, 6, 23))).toBe("P"); // Perşembe
    expect(weekdayLetter(new Date(2026, 6, 24))).toBe("C"); // Cuma
    expect(weekdayLetter(new Date(2026, 6, 25))).toBe("C"); // Cumartesi
    expect(weekdayLetter(new Date(2026, 6, 26))).toBe("P"); // Pazar
  });
});

/**
 * `new Date("2026-08-03")` ISO tarih-only string'ini JS spec'i UTC gece yarısı
 * sayıyor. UTC'nin GERİSİNDE olan saat dilimlerinde (Amerika kıtasının tamamı)
 * o Date yerel olarak bir GÜN ÖNCEyi gösteriyor. Sonuç iki türlüydü: ekrandaki
 * her tarih etiketi bir gün geri kayıyordu ve fotoğrafsız gün / antrenman
 * programı ekranları route'tan gelen tarihi YANLIŞ güne yazıyordu.
 *
 * Türkiye (UTC+3) hep pozitif offset'te olduğu için hata yerelde hiç
 * görünmüyordu — bu testler onu kalıcı olarak yakalıyor.
 */
describe("parseLocalDate", () => {
  it("tarih anahtarını YEREL gün başlangıcı olarak okur", () => {
    const d = parseLocalDate("2026-08-03");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7); // Ağustos
    expect(d.getDate()).toBe(3);
    expect(d.getHours()).toBe(0);
  });

  it("gidiş-dönüş toLocalDateKey ile aynı anahtarı verir", () => {
    for (const key of ["2026-01-01", "2026-08-03", "2025-12-31", "2024-02-29"]) {
      expect(toLocalDateKey(parseLocalDate(key))).toBe(key);
    }
  });

  /**
   * Saat dilimini test içinde değiştirmek İŞE YARAMIYOR: V8 yerel saat dilimini
   * ilk Date kullanımında önbelleğe alıyor, sonradan `process.env.TZ` yazmak onu
   * değiştirmiyor. Bu yüzden hatayı saat dilimi taklit ederek değil, DAVRANIŞIN
   * KENDİSİNİ sabitleyerek yakalıyoruz: parseLocalDate yerel bileşenlerden
   * kuruluyor, `new Date(key)` ise UTC'den. Offset sıfır olmayan her ortamda bu
   * ikisi farklı anlar — ve yalnızca ilki gün numarasını korur.
   */
  it("UTC gece yarısını DEĞİL yerel gece yarısını üretir", () => {
    const local = new Date(2026, 7, 3); // 3 Ağustos 2026, yerel 00:00
    expect(parseLocalDate("2026-08-03").getTime()).toBe(local.getTime());

    if (local.getTimezoneOffset() !== 0) {
      // Eski kalıp (`new Date("2026-08-03")`) farklı bir ana işaret ediyor;
      // negatif offset'te bu fark günü geriye kaydıran hatanın kaynağı.
      expect(parseLocalDate("2026-08-03").getTime()).not.toBe(
        new Date("2026-08-03").getTime()
      );
    }
  });
});

describe("formatDateKey", () => {
  it("tarih anahtarını Türkçe biçimde yazar", () => {
    expect(formatDateKey("2026-08-03", { day: "numeric", month: "long", year: "numeric" })).toBe(
      "3 Ağustos 2026"
    );
  });

  it("gün numarası anahtardaki günle birebir aynı kalır", () => {
    // Asıl regresyon: etiketler bir gün geri kayıyordu. Ay sınırları en riskli
    // yer — ay adı da beraber değişiyordu.
    expect(formatDateKey("2026-01-01", { day: "numeric", month: "long" })).toBe("1 Ocak");
    expect(formatDateKey("2026-03-01", { day: "numeric", month: "long" })).toBe("1 Mart");
    expect(formatDateKey("2025-12-31", { day: "numeric", month: "long" })).toBe("31 Aralık");
  });
});
