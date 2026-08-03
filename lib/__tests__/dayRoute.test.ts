import { dayRoute } from "../dayRoute";

/**
 * Hafta şeridi ve yıllık takvim bu tek kuralı paylaşıyor; ayrışırsa aynı güne
 * iki ekrandan dokunmak farklı yerlere götürür.
 */
describe("dayRoute", () => {
  const day = (over: Partial<Parameters<typeof dayRoute>[0]> = {}) => ({
    date: "2026-07-08",
    id: null,
    type: null,
    isFuture: false,
    ...over,
  });

  it("fotoğraflı günü kendi kaydına götürür", () => {
    expect(dayRoute(day({ type: "log", id: "e1" }))).toBe("/entry/e1");
  });

  it("boş günü o TARİHLE fotoğrafsız gün ekranına götürür", () => {
    expect(dayRoute(day())).toBe("/entry/workout?date=2026-07-08");
  });

  it("off day ve antrenman günleri de fotoğrafsız gün ekranından düzenlenir", () => {
    expect(dayRoute(day({ type: "off_day", id: "e2" }))).toBe("/entry/workout?date=2026-07-08");
    expect(dayRoute(day({ type: "workout", id: "e3" }))).toBe("/entry/workout?date=2026-07-08");
  });

  it("gelecek gün için route yok", () => {
    expect(dayRoute(day({ isFuture: true }))).toBeNull();
    // Kaydı olsa bile: gelecek gün hiçbir koşulda dokunulabilir değil.
    expect(dayRoute(day({ isFuture: true, type: "log", id: "e4" }))).toBeNull();
  });

  it("tipi 'log' ama id'si yoksa fotoğrafsız gün ekranına düşer", () => {
    // Kayıp id ile `/entry/null`'a gitmek boş bir detay ekranı açardı.
    expect(dayRoute(day({ type: "log", id: null }))).toBe("/entry/workout?date=2026-07-08");
  });
});
