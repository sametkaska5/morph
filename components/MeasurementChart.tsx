import { useMemo, useState } from "react";
import { View, Pressable, ScrollView } from "react-native";
import Svg, { Path, Circle, Line, Defs, LinearGradient, Stop } from "react-native-svg";
import { Text } from "@/components/Typography";
import { buildChartPath, CHART_PAD_X } from "@/lib/chart";
import { formatDateKey } from "@/lib/date";

/** Bu sayıdan fazla veri noktası varsa tek tek noktalar çizgiyi boğuyor. */
const MAX_VISIBLE_DOTS = 24;
const TOOLTIP_W = 96;
/** Büyütme ekranında aynı anda görünecek en fazla nokta sayısı. Daha fazlası
 *  varsa grafik genişleyip yatayda kaydırılabilir olur (gerisi kaydırınca gelir).
 *  Ekran tarafı "kaydır" ipucunu göstermek için de kullanıyor — o yüzden export. */
export const VISIBLE_POINTS = 7;

/**
 * Ölçüm serisini çizen interaktif grafik. Hem karttaki KÜÇÜK hâlde hem de
 * "büyüt" modalındaki BÜYÜK hâlde kullanılıyor — bu yüzden yükseklik ve seçili
 * nokta dışarıdan (controlled) veriliyor; genişliği kendisi ölçüyor.
 */
export function MeasurementChart({
  values,
  series,
  unitLabel,
  height,
  selectedIndex,
  onSelect,
  scrollable = false,
}: {
  values: number[];
  series: { date: string; value: number }[] | undefined;
  unitLabel: string;
  height: number;
  selectedIndex: number | null;
  onSelect: (index: number | null) => void;
  /** true ise nokta sayısı ekranı aşınca grafik yatayda kaydırılabilir olur. */
  scrollable?: boolean;
}) {
  // viewportW: bileşene ayrılan görünür genişlik. contentW: grafiğin ASIL çizim
  // genişliği — kaydırmalı modda nokta başına en az MIN_SCROLL_STEP düşecek
  // şekilde viewport'u aşabilir; aşarsa aşağıda yatay ScrollView'a sarılıyor.
  const [viewportW, setViewportW] = useState(0);
  // Kaydırmalı modda adım, viewport'a tam VISIBLE_POINTS nokta sığacak şekilde
  // seçiliyor; nokta sayısı bunu aşarsa contentW viewport'tan geniş olur ve
  // aşağıda yatay ScrollView devreye girer (ekranda hep ~7 nokta, gerisi kaydırma).
  const scrollStep = viewportW > 0 ? (viewportW - CHART_PAD_X * 2) / (VISIBLE_POINTS - 1) : 0;
  const contentW =
    scrollable && values.length > VISIBLE_POINTS
      ? CHART_PAD_X * 2 + (values.length - 1) * scrollStep
      : viewportW;

  // Nokta seçimi her değiştiğinde bileşen yeniden render oluyor; path'i yalnızca
  // veri ya da boyut değişince kurmak hem O(n) string üretimini hem de SVG diff
  // maliyetini (d prop'ları aynı kalır) seçim dokunuşlarından çıkarıyor.
  // values'un kimliği ekran tarafında useMemo ile sabitleniyor.
  const { line, area, points } = useMemo(
    () => buildChartPath(values, contentW, height),
    [values, contentW, height],
  );

  const activeIndex = selectedIndex != null && selectedIndex < values.length ? selectedIndex : null;
  const selectedPoint = activeIndex != null ? points[activeIndex] : null;
  const lastPoint = points[points.length - 1];
  const selectedDate = activeIndex != null ? (series?.[activeIndex]?.date ?? null) : null;
  const selectedValue = activeIndex != null ? values[activeIndex] : null;

  // Çizim gövdesi: Svg + dokunma katmanı + baloncuk. Kaydırmalı modda bunu
  // contentW genişliğinde bir ScrollView içine koyuyoruz; locationX ve baloncuğun
  // absolute konumu bu gövdeye göre olduğu için kaydırınca da doğru çalışıyor.
  const chartBody = (
    <View style={{ width: contentW, height }}>
      <Svg width={contentW} height={height}>
        <Defs>
          <LinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#8CE05A" stopOpacity={0.35} />
            <Stop offset="100%" stopColor="#8CE05A" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path d={area} fill="url(#areaGrad)" />
        <Path
          d={line}
          fill="none"
          stroke="#8CE05A"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {selectedPoint ? (
          <Line
            x1={selectedPoint.x}
            y1={0}
            x2={selectedPoint.x}
            y2={height}
            stroke="#8CE05A"
            strokeOpacity={0.35}
            strokeWidth={1}
            strokeDasharray="3 4"
          />
        ) : null}

        {/* Küçük noktalar dokunulabilir olduğunu belli ediyor; kalabalıkta
            çizgiyi boğmasın diye gizleniyor. Dolu accent + koyu kontur:
            nokta çizgiyle aynı renk olduğu için ince halka olmadan çizgiye
            karışıyordu. */}
        {scrollable || points.length <= MAX_VISIBLE_DOTS
          ? points.map((p, i) =>
              i === activeIndex ? null : (
                <Circle
                  key={`dot-${i}`}
                  cx={p.x}
                  cy={p.y}
                  r={3.5}
                  fill="#8CE05A"
                  stroke="#0B0D0A"
                  strokeWidth={1.5}
                />
              ),
            )
          : null}

        {/* Son ve seçili nokta içi boş halka — dolu noktalardan ayrışıp
            hiyerarşiyi koruyor. */}
        {activeIndex == null && lastPoint ? (
          <Circle
            cx={lastPoint.x}
            cy={lastPoint.y}
            r={5}
            fill="#0B0D0A"
            stroke="#8CE05A"
            strokeWidth={2.5}
          />
        ) : null}

        {selectedPoint ? (
          <Circle
            cx={selectedPoint.x}
            cy={selectedPoint.y}
            r={6}
            fill="#0B0D0A"
            stroke="#8CE05A"
            strokeWidth={3}
          />
        ) : null}
      </Svg>

      {/* Dokunmayı SVG şekilleri yerine üstteki bu katman yakalıyor:
          react-native-svg'de şeffaf dolgulu şekillerin isabet algılaması
          platforma göre değişebiliyor. Tam noktaya basmak gerekmiyor —
          en yakın nokta seçiliyor. */}
      <Pressable
        onPress={(e) => {
          const x = e.nativeEvent.locationX;
          let nearest = 0;
          let bestDistance = Infinity;
          points.forEach((p, i) => {
            const distance = Math.abs(p.x - x);
            if (distance < bestDistance) {
              bestDistance = distance;
              nearest = i;
            }
          });
          onSelect(selectedIndex === nearest ? null : nearest);
        }}
        accessibilityRole="button"
        accessibilityLabel="Grafikte bir güne dokunarak o günün değerini gör"
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />

      {selectedPoint && selectedDate ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            width: TOOLTIP_W,
            // Baloncuk grafiğin dışına taşmasın diye yatayda sınırlanıyor.
            left: Math.min(
              Math.max(selectedPoint.x - TOOLTIP_W / 2, 0),
              Math.max(contentW - TOOLTIP_W, 0),
            ),
            // Nokta tepedeyse baloncuk yukarı sığmıyor, altına alıyoruz.
            top: selectedPoint.y > 48 ? selectedPoint.y - 48 : selectedPoint.y + 14,
          }}
        >
          <View className="bg-bg border border-accent rounded-lg px-2 py-1.5 items-center">
            <Text className="text-textFaint text-xs">
              {formatDateKey(selectedDate, { day: "numeric", month: "short" })}
            </Text>
            <Text className="text-text text-sm font-semibold">
              {selectedValue} {unitLabel}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );

  return (
    <View onLayout={(e) => setViewportW(e.nativeEvent.layout.width)} style={{ height }}>
      {viewportW > 0 && points.length > 0 ? (
        scrollable && contentW > viewportW ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ height }}
            // Grafik son (en yeni) noktadan başlasın — kullanıcı çoğunlukla
            // son değerlerle ilgileniyor, gerisini geriye kaydırarak görür.
            contentOffset={{ x: Math.max(contentW - viewportW, 0), y: 0 }}
          >
            {chartBody}
          </ScrollView>
        ) : (
          chartBody
        )
      ) : null}
    </View>
  );
}
