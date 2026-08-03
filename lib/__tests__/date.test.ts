import { toLocalDateKey, getMondayOfWeek, weekdayLetter, formatWeekRange } from "../date";

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
