import { computeStreaks } from "../profileStats";

// computeStreaks "mevcut seri"yi bugüne göre hesaplar (son kayıt bugün ya da dün
// mü?). Testin ne zaman çalışırsa çalışsın kararlı olması için tarihleri BUGÜNE
// göreli üretiyoruz — fonksiyonun kendi yaklaşımıyla (yerel tarih anahtarı) tutarlı.
function key(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return key(d);
}

describe("computeStreaks", () => {
  it("boş listede sıfır döner", () => {
    expect(computeStreaks([])).toEqual({ current: 0, longest: 0 });
  });

  it("bugün tek kayıt -> mevcut ve en uzun = 1", () => {
    expect(computeStreaks([daysAgo(0)])).toEqual({ current: 1, longest: 1 });
  });

  it("bugüne kadar 3 ardışık gün -> mevcut ve en uzun = 3", () => {
    const dates = [daysAgo(2), daysAgo(1), daysAgo(0)];
    expect(computeStreaks(dates)).toEqual({ current: 3, longest: 3 });
  });

  it("son kayıt dün ise mevcut seri hâlâ sayılır", () => {
    const dates = [daysAgo(2), daysAgo(1)];
    expect(computeStreaks(dates)).toEqual({ current: 2, longest: 2 });
  });

  it("son kayıt 2 gün önce ise mevcut seri kopar (0), en uzun korunur", () => {
    const dates = [daysAgo(4), daysAgo(3), daysAgo(2)];
    const { current, longest } = computeStreaks(dates);
    expect(current).toBe(0);
    expect(longest).toBe(3);
  });

  it("aradaki boşluk seriyi böler; en uzun geçmişteki uzun seri olabilir", () => {
    // Geçmişte 4'lük seri, sonra boşluk, bugün 2'lik seri.
    const dates = [
      daysAgo(10),
      daysAgo(9),
      daysAgo(8),
      daysAgo(7), // 4'lük
      daysAgo(1),
      daysAgo(0), // bugüne kadar 2'lik
    ];
    const { current, longest } = computeStreaks(dates);
    expect(current).toBe(2);
    expect(longest).toBe(4);
  });

  it("aynı günün tekrarı seriyi bozmaz (diff 0)", () => {
    const dates = [daysAgo(1), daysAgo(1), daysAgo(0)];
    const { current } = computeStreaks(dates);
    expect(current).toBe(2);
  });
});
