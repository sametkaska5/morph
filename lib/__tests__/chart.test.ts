import { smoothLine, buildChartPath, CHART_PAD_X, type ChartPoint } from "../chart";

describe("smoothLine", () => {
  it("boş listede boş string döner", () => {
    expect(smoothLine([])).toBe("");
  });

  it("tek noktada yalnızca Move komutu üretir", () => {
    expect(smoothLine([{ x: 10, y: 20 }])).toBe("M10,20");
  });

  it("iki+ noktada M ile başlar ve her segment için bir C (kübik Bézier) içerir", () => {
    const points: ChartPoint[] = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 5 },
    ];
    const d = smoothLine(points);
    expect(d.startsWith("M0,0")).toBe(true);
    // 3 nokta = 2 segment = 2 adet C komutu
    expect(d.match(/C/g)).toHaveLength(2);
    // Eğri son noktada bitmeli
    expect(d.endsWith("20,5")).toBe(true);
  });

  it("düz yatay seride kontrol noktaları da aynı y'de kalır (taşma yok)", () => {
    const points: ChartPoint[] = [
      { x: 0, y: 50 },
      { x: 10, y: 50 },
      { x: 20, y: 50 },
    ];
    const d = smoothLine(points);
    // Tüm y değerleri 50 olmalı — yumuşatma düz çizgiyi bozmamalı.
    const ys = d.match(/,(-?[\d.]+)/g)?.map((s) => Number(s.slice(1))) ?? [];
    expect(ys.length).toBeGreaterThan(0);
    ys.forEach((y) => expect(y).toBe(50));
  });
});

describe("buildChartPath", () => {
  it("boş veri ya da geçersiz genişlikte boş sonuç döner", () => {
    expect(buildChartPath([], 300, 110)).toEqual({ line: "", area: "", points: [] });
    expect(buildChartPath([70], 0, 110)).toEqual({ line: "", area: "", points: [] });
  });

  it("tek değeri yatayda ortalar", () => {
    const { points } = buildChartPath([70], 300, 110);
    expect(points).toHaveLength(1);
    expect(points[0].x).toBe(150);
  });

  it("noktaları CHART_PAD_X içinde tutar ve eşit aralıklarla dağıtır", () => {
    const width = 300;
    const { points } = buildChartPath([70, 71, 72, 73], width, 110);
    expect(points[0].x).toBe(CHART_PAD_X);
    expect(points[points.length - 1].x).toBe(width - CHART_PAD_X);
    // Eşit adım
    const step1 = points[1].x - points[0].x;
    const step2 = points[2].x - points[1].x;
    expect(step1).toBeCloseTo(step2);
  });

  it("min değer en altta (büyük y), max değer en üstte (küçük y) olur", () => {
    const height = 110;
    const { points } = buildChartPath([60, 90, 75], 300, height);
    const [pMin, pMax, pMid] = points;
    expect(pMin.y).toBeGreaterThan(pMax.y);
    expect(pMid.y).toBeGreaterThan(pMax.y);
    expect(pMid.y).toBeLessThan(pMin.y);
    // 10px dikey pay: y hiçbir zaman [10, height-10] dışına çıkmaz.
    points.forEach((p) => {
      expect(p.y).toBeGreaterThanOrEqual(10);
      expect(p.y).toBeLessThanOrEqual(height - 10);
    });
  });

  it("tüm değerler eşitken sıfıra bölme yapmaz (range=1 kabul edilir)", () => {
    const { points } = buildChartPath([70, 70, 70], 300, 110);
    points.forEach((p) => expect(Number.isFinite(p.y)).toBe(true));
    // Eşit değerler aynı yatay hizada olmalı.
    expect(new Set(points.map((p) => p.y)).size).toBe(1);
  });

  it("alan yolu çizgiyle başlar ve tabana inip Z ile kapanır", () => {
    const height = 110;
    const { line, area, points } = buildChartPath([70, 72], 300, height);
    expect(area.startsWith(line)).toBe(true);
    expect(area.endsWith("Z")).toBe(true);
    expect(area).toContain(`L${points[1].x},${height}`);
    expect(area).toContain(`L${points[0].x},${height}`);
  });
});
