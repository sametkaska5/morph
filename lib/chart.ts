/**
 * Ölçüm grafiğinin SAF matematiği — SVG path üretimi, React'siz.
 *
 * components/MeasurementChart.tsx bunları çizim için kullanır; burada durmasının
 * nedeni test edilebilirlik: path üretimi ekran bileşeninin içindeyken hiç test
 * yazılamıyordu (bkz. lib/__tests__/chart.test.ts).
 */

export type ChartPoint = { x: number; y: number };

/** Çizgi yumuşatma gücü. Fazlası veriyi çarpıtan taşmalara yol açıyor. */
const SMOOTHING = 0.18;

/** Grafiğin yatay iç boşluğu. İlk/son nokta eskiden x=0 ve x=width'te, yani tam
 *  kenarda kalıyordu — hem basılması zordu hem ekran kenarı hareketleriyle
 *  çakışıyordu. Noktaları bu kadar içeri alıyoruz. */
export const CHART_PAD_X = 16;

/**
 * Noktaları köşesiz bir eğriye çevirir (Catmull-Rom → kübik Bézier).
 * Eskiden düz `L` segmentleriyle çiziliyordu; her veri noktasında keskin bir
 * köşe oluşuyordu.
 */
export function smoothLine(points: ChartPoint[]) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;

  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    // Uçlarda komşu nokta olmadığı için noktanın kendisini kullanıyoruz —
    // böylece ilk/son segment dışarı taşmadan düzleşiyor.
    const prev = points[i - 1] ?? points[i];
    const curr = points[i];
    const next = points[i + 1];
    const after = points[i + 2] ?? next;

    const cp1x = curr.x + (next.x - prev.x) * SMOOTHING;
    const cp1y = curr.y + (next.y - prev.y) * SMOOTHING;
    const cp2x = next.x - (after.x - curr.x) * SMOOTHING;
    const cp2y = next.y - (after.y - curr.y) * SMOOTHING;

    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${next.x},${next.y}`;
  }
  return d;
}

/**
 * Grafiği ölçülen GERÇEK genişliğe göre kurar. Eskiden sabit bir viewBox (300)
 * vardı ve preserveAspectRatio yüzünden kart daha genişse grafik ortada dar
 * kalıyordu. Gerçek genişlikle SVG birimi = ekran noktası oluyor, bu da hem
 * grafiğin tam yayılmasını hem de dokunma baloncuğunun koordinat dönüşümü
 * olmadan konumlandırılmasını sağlıyor.
 */
export function buildChartPath(values: number[], width: number, height: number) {
  if (values.length === 0 || width <= 0) {
    return { line: "", area: "", points: [] as ChartPoint[] };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  // Noktalar kenara yapışmasın diye iki yandan CHART_PAD_X kadar içeride kalır.
  const usableW = Math.max(width - CHART_PAD_X * 2, 1);
  const stepX = values.length > 1 ? usableW / (values.length - 1) : 0;

  const points: ChartPoint[] = values.map((v, i) => ({
    // Tek veri varsa ortala, yoksa sola yapışık tek bir nokta kalıyor.
    x: values.length === 1 ? width / 2 : CHART_PAD_X + i * stepX,
    y: height - ((v - min) / range) * (height - 20) - 10,
  }));

  const line = smoothLine(points);
  const first = points[0];
  const last = points[points.length - 1];
  const area = `${line} L${last.x},${height} L${first.x},${height} Z`;

  return { line, area, points };
}
