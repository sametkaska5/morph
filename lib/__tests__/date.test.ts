import { toLocalDateKey, getMondayOfWeek, weekdayLetter } from "../date";

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
