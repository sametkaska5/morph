import { computeWeekStreak, computeTrend, invalidateStatsQueries } from "../stats";
import type { QueryClient } from "@tanstack/react-query";

type Day = { isFuture: boolean; type: string | null };
const day = (type: string | null, isFuture = false): Day => ({ type, isFuture });

describe("computeWeekStreak", () => {
  it("boş haftada 0 döner", () => {
    expect(computeWeekStreak([])).toBe(0);
  });

  it("gelecek günleri atlayıp bugünden geriye sayar", () => {
    // Pzt-Çar dolu, Perşembe bugün (dolu), Cum-Paz gelecek → 4
    const week = [
      day("log"),
      day("workout"),
      day("off_day"),
      day("log"),
      day(null, true),
      day(null, true),
      day(null, true),
    ];
    expect(computeWeekStreak(week)).toBe(4);
  });

  it("aradaki boş gün seriyi keser — yalnızca son bloğu sayar", () => {
    const week = [
      day("log"),
      day(null),
      day("log"),
      day("log"),
      day(null, true),
      day(null, true),
      day(null, true),
    ];
    expect(computeWeekStreak(week)).toBe(2);
  });

  it("bugün boşsa seri 0'dır", () => {
    const week = [
      day("log"),
      day("log"),
      day(null),
      day(null, true),
      day(null, true),
      day(null, true),
      day(null, true),
    ];
    expect(computeWeekStreak(week)).toBe(0);
  });

  it("tüm hafta doluysa 7 döner", () => {
    expect(computeWeekStreak(Array.from({ length: 7 }, () => day("log")))).toBe(7);
  });
});

describe("computeTrend", () => {
  it("iki değer de yoksa delta null ve isGood true (nötr) döner", () => {
    expect(computeTrend(undefined, undefined, "decrease_is_good")).toEqual({
      delta: null,
      isGood: true,
    });
    expect(computeTrend(70, undefined, "decrease_is_good")).toEqual({ delta: null, isGood: true });
  });

  it("delta tek ondalığa yuvarlanır", () => {
    expect(computeTrend(70.25, 70, "increase_is_good").delta).toBe(0.3);
    expect(computeTrend(69.94, 70, "increase_is_good").delta).toBe(-0.1);
  });

  it("kilo gibi 'düşüş iyi' ölçümlerde azalma iyi, artış kötüdür", () => {
    expect(computeTrend(69, 70, "decrease_is_good").isGood).toBe(true);
    expect(computeTrend(71, 70, "decrease_is_good").isGood).toBe(false);
  });

  it("kas ölçüsü gibi 'artış iyi' ölçümlerde artış iyi, azalma kötüdür", () => {
    expect(computeTrend(41, 40, "increase_is_good").isGood).toBe(true);
    expect(computeTrend(39, 40, "increase_is_good").isGood).toBe(false);
  });

  it("değişim yoksa (delta 0) her iki yönde de iyi sayılır", () => {
    expect(computeTrend(70, 70, "decrease_is_good").isGood).toBe(true);
    expect(computeTrend(70, 70, "increase_is_good").isGood).toBe(true);
  });

  it("hedef yönü bilinmiyorsa nötr (isGood true) kalır", () => {
    expect(computeTrend(71, 70, undefined).isGood).toBe(true);
  });
});

describe("invalidateStatsQueries", () => {
  it("İstatistikler ekranını besleyen BEŞ sorgu ailesini de tazeler", async () => {
    // Biri unutulursa ekran sessizce bayat veri gösterir; en tehlikelisi
    // measurement_series — başka ekrandan değiştirilen ölçüm grafikte eski
    // değeriyle kalır ve kullanıcı bunu fark edemez.
    const invalidateQueries = jest.fn().mockResolvedValue(undefined);

    await invalidateStatsQueries({ invalidateQueries } as unknown as QueryClient);

    const families = invalidateQueries.mock.calls.map((c) => c[0].queryKey[0]);
    expect(families).toEqual([
      "measurement_series",
      "currentWeek",
      "shareablePhotos",
      "measurement_types",
      "profile",
    ]);
  });

  it("hepsini PARALEL başlatır (sıralı beklemez)", async () => {
    // Sıralı olsaydı yenileme beş ağ gidiş-dönüşü kadar sürerdi.
    let resolveFirst: () => void = () => {};
    const gate = new Promise<void>((r) => (resolveFirst = r));
    const invalidateQueries = jest.fn().mockReturnValueOnce(gate).mockResolvedValue(undefined);

    const pending = invalidateStatsQueries({ invalidateQueries } as unknown as QueryClient);

    // İlk çağrı henüz çözülmemişken beşi de başlatılmış olmalı.
    expect(invalidateQueries).toHaveBeenCalledTimes(5);
    resolveFirst();
    await pending;
  });
});
