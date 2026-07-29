import { useCallback, useEffect, useRef, useState } from "react";
import { View, ScrollView, Pressable, ActivityIndicator, Alert, Image, Modal, RefreshControl } from "react-native";
import { Text } from "@/components/Typography";
import Svg, { Path, Circle, Line, Defs, LinearGradient, Stop } from "react-native-svg";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import type * as MediaLibraryType from "expo-media-library";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { toLocalDateKey, getMondayOfWeek, weekdayLetter } from "@/lib/date";
import { scheduleStreakRiskNotification } from "@/lib/notifications";
import { useNotificationSettings } from "@/lib/notificationSettings";
import { useMeasurementTypes } from "@/lib/measurementTypes";
import { useUnitPreference, displayUnit, toDisplayValue } from "@/lib/units";
import { getPhotoUrls } from "@/lib/storage";

let MediaLibrary: typeof MediaLibraryType | null = null;
try {
  MediaLibrary = require("expo-media-library");
} catch {
  MediaLibrary = null;
}

const CHART_H = 110;
/** Çizgi yumuşatma gücü. Fazlası veriyi çarpıtan taşmalara yol açıyor. */
const SMOOTHING = 0.18;
/** Bu sayıdan fazla veri noktası varsa tek tek noktalar çizgiyi boğuyor. */
const MAX_VISIBLE_DOTS = 24;
const TOOLTIP_W = 96;
/** Grafiğin yatay iç boşluğu. İlk/son nokta eskiden x=0 ve x=width'te, yani tam
 *  kenarda kalıyordu — hem basılması zordu hem ekran kenarı hareketleriyle
 *  çakışıyordu. Noktaları bu kadar içeri alıyoruz. */
const CHART_PAD_X = 16;
/** Büyütme ekranında aynı anda görünecek en fazla nokta sayısı. Daha fazlası
 *  varsa grafik genişleyip yatayda kaydırılabilir olur (gerisi kaydırınca gelir). */
const VISIBLE_POINTS = 7;

type ChartPoint = { x: number; y: number };

function useMeasurementSeries(userId: string | undefined, typeId: string | undefined) {
  return useQuery({
    // userId anahtarda yoksa, aynı cihazda hesap değiştirildiğinde önceki
    // kullanıcının grafiği cache'ten okunabiliyordu.
    queryKey: ["measurement_series", userId, typeId],
    enabled: !!userId && !!typeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("measurement_values")
        .select("value, entries!inner(date, type, user_id)")
        .eq("measurement_type_id", typeId)
        .eq("entries.user_id", userId)
        // Fotoğrafsız günlerde (workout) girilen ölçümler de grafikte görünsün —
        // eskiden yalnızca 'log' okunuyordu, foto çekilmeyen günün ölçümü kaybolurdu.
        .in("entries.type", ["log", "workout"]);
      if (error) throw error;
      // Sıralamayı JS'te yapıyoruz. entries bu sorguda to-one bir ilişki olduğu
      // için PostgREST'in foreignTable order'ı ANA satırları (measurement_values)
      // güvenilir sıralamıyordu — değerler ekleme sırasında gelip grafik yanlış
      // diziliyordu. Tarihe göre ARTAN sıralayınca en eski solda, en yeni sağda olur.
      return (data ?? [])
        .map((d: any) => ({ date: d.entries.date, value: d.value }))
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    },
  });
}

function useCurrentWeek(userId: string | undefined) {
  return useQuery({
    queryKey: ["currentWeek", userId],
    enabled: !!userId,
    queryFn: async () => {
      const todayKey = toLocalDateKey(new Date());
      const monday = getMondayOfWeek(new Date());

      const days: { date: string; label: string; isFuture: boolean; isToday: boolean }[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const dateKey = toLocalDateKey(d);
        days.push({
          date: dateKey,
          label: weekdayLetter(d),
          isFuture: dateKey > todayKey,
          isToday: dateKey === todayKey,
        });
      }

      const { data, error } = await supabase
        .from("entries")
        .select("id, date, type")
        .eq("user_id", userId)
        .gte("date", days[0].date)
        .lte("date", days[days.length - 1].date);
      if (error) throw error;

      const byDate = new Map((data ?? []).map((e) => [e.date, { id: e.id, type: e.type }]));
      return days.map((d) => ({
        ...d,
        id: byDate.get(d.date)?.id ?? null,
        type: byDate.get(d.date)?.type ?? null,
      }));
    },
  });
}

function useShareablePhotoEntries(userId: string | undefined) {
  return useQuery({
    queryKey: ["shareablePhotos", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entries")
        .select("id, date, photos!cover_photo_id(storage_path)")
        .eq("user_id", userId)
        .eq("type", "log")
        .not("cover_photo_id", "is", null)
        .order("date", { ascending: false })
        .limit(12);
      if (error) throw error;

      const paths = (data ?? [])
        .map((entry: any) => entry.photos?.storage_path)
        .filter(Boolean) as string[];
      const urlMap = await getPhotoUrls(paths);

      return (data ?? [])
        .map((entry: any) => ({
          id: entry.id,
          date: entry.date,
          photoUrl: entry.photos?.storage_path ? urlMap.get(entry.photos.storage_path) ?? null : null,
          photoPath: entry.photos?.storage_path ?? null,
        }))
        .filter((entry) => entry.photoUrl);
    },
  });
}

/**
 * Noktaları köşesiz bir eğriye çevirir (Catmull-Rom → kübik Bézier).
 * Eskiden düz `L` segmentleriyle çiziliyordu; her veri noktasında keskin bir
 * köşe oluşuyordu.
 */
function smoothLine(points: ChartPoint[]) {
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
function buildChartPath(values: number[], width: number, height: number) {
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

/**
 * Ölçüm serisini çizen interaktif grafik. Hem karttaki KÜÇÜK hâlde hem de
 * "büyüt" modalındaki BÜYÜK hâlde kullanılıyor — bu yüzden yükseklik ve seçili
 * nokta dışarıdan (controlled) veriliyor; genişliği kendisi ölçüyor.
 */
function MeasurementChart({
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

  const { line, area, points } = buildChartPath(values, contentW, height);

  const activeIndex = selectedIndex != null && selectedIndex < values.length ? selectedIndex : null;
  const selectedPoint = activeIndex != null ? points[activeIndex] : null;
  const lastPoint = points[points.length - 1];
  const selectedDate = activeIndex != null ? series?.[activeIndex]?.date ?? null : null;
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
        <Path d={line} fill="none" stroke="#8CE05A" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

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
              )
            )
          : null}

        {/* Son ve seçili nokta içi boş halka — dolu noktalardan ayrışıp
            hiyerarşiyi koruyor. */}
        {activeIndex == null && lastPoint ? (
          <Circle cx={lastPoint.x} cy={lastPoint.y} r={5} fill="#0B0D0A" stroke="#8CE05A" strokeWidth={2.5} />
        ) : null}

        {selectedPoint ? (
          <Circle cx={selectedPoint.x} cy={selectedPoint.y} r={6} fill="#0B0D0A" stroke="#8CE05A" strokeWidth={3} />
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
            left: Math.min(Math.max(selectedPoint.x - TOOLTIP_W / 2, 0), Math.max(contentW - TOOLTIP_W, 0)),
            // Nokta tepedeyse baloncuk yukarı sığmıyor, altına alıyoruz.
            top: selectedPoint.y > 48 ? selectedPoint.y - 48 : selectedPoint.y + 14,
          }}
        >
          <View className="bg-bg border border-accent rounded-lg px-2 py-1.5 items-center">
            <Text className="text-textFaint text-xs">
              {new Date(selectedDate).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
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

export default function Istatistikler() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: types } = useMeasurementTypes(user?.id);
  const [activeTypeId, setActiveTypeId] = useState<string | null>(null);
  /** Grafikte dokunulan nokta. null = seçim yok, başlıkta son değer gösterilir. */
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  /** Büyütme modalı açık mı + orada seçili nokta (satır içinden bağımsız). */
  const [chartExpanded, setChartExpanded] = useState(false);
  const [modalSelectedIndex, setModalSelectedIndex] = useState<number | null>(null);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [selectedSharePhotoId, setSelectedSharePhotoId] = useState<string | null>(null);
  const [sharePendingAction, setSharePendingAction] = useState<"save" | "share" | null>(null);
  const shareCardRef = useRef<View>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Aşağı çekince yenile: bu ekrandaki tüm sorguları geçersiz kılıp yeniden
  // çekiyoruz. Özellikle measurement_series önemli — bir kaydın ölçümünü başka
  // ekrandan (düzenleme) değiştirince grafik cache'ten eski değeri gösterebiliyor;
  // bu, kullanıcının onu elle tazeleyebilmesini sağlıyor.
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["measurement_series"] }),
        queryClient.invalidateQueries({ queryKey: ["currentWeek"] }),
        queryClient.invalidateQueries({ queryKey: ["shareablePhotos"] }),
        queryClient.invalidateQueries({ queryKey: ["measurement_types"] }),
        queryClient.invalidateQueries({ queryKey: ["profile"] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);

  function dayAccessibilityLabel(day: { date: string; type: string | null; isFuture: boolean; isToday: boolean }) {
    const dateLabel = new Date(day.date).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" });
    if (day.isFuture) return `${dateLabel}, henüz gelmedi`;
    const statusLabel =
      day.type === "log"
        ? "fotoğraflı kayıt var, açmak için dokun"
        : day.type === "off_day"
        ? "off day olarak işaretli, düzenlemek için dokun"
        : day.type === "workout"
        ? "antrenman günü, düzenlemek için dokun"
        : "boş, ölçüm veya program eklemek için dokun";
    return `${dateLabel}${day.isToday ? ", bugün" : ""}, ${statusLabel}`;
  }

  // Fotoğraflı gün → o kaydı aç. Diğer tüm günler (boş / off_day / workout) →
  // fotoğrafsız gün ekranı, o tarih ön-doldurulmuş olarak. Eskiden buradaki
  // dokunma boş→off_day→workout→boş şeklinde hızlı döngü yapıyordu; artık ölçüm
  // ve program da girilebildiği için tam ekrana yönlendiriyoruz (off-day işaretleme
  // o ekranın içindeki seçimle korunuyor).
  function handleDayPress(day: { date: string; id: string | null; type: string | null; isFuture: boolean }) {
    if (day.isFuture) return;
    if (day.type === "log" && day.id) {
      router.push(`/entry/${day.id}`);
      return;
    }
    router.push(`/entry/workout?date=${day.date}`);
  }

  const currentTypeId = activeTypeId ?? types?.[0]?.id;
  const activeType = types?.find((t) => t.id === currentTypeId);

  const { data: series, isLoading: seriesLoading } = useMeasurementSeries(user?.id, currentTypeId);
  const { data: week, isLoading: weekLoading } = useCurrentWeek(user?.id);
  const { data: shareablePhotos, isLoading: sharePhotosLoading } = useShareablePhotoEntries(user?.id);
  const { data: unitPref = "metric" } = useUnitPreference(user?.id);

  const values = activeType
    ? (series?.map((s) => toDisplayValue(s.value, activeType.unit, unitPref)) ?? [])
    : series?.map((s) => s.value) ?? [];
  const unitLabel = activeType ? displayUnit(activeType.unit, unitPref) : "";

  // Seçili nokta ölçüm tipi değişince geçersizleşiyor (yeni serinin uzunluğu
  // farklı olabilir) — sınır dışıysa yok sayıyoruz.
  const activeIndex = selectedIndex != null && selectedIndex < values.length ? selectedIndex : null;

  // Başlıktaki büyük değer: bir nokta seçiliyse o günün değeri, yoksa sonuncusu.
  const currentValue = activeIndex != null ? values[activeIndex] : values[values.length - 1];
  const previousValue = activeIndex != null ? values[activeIndex - 1] : values[values.length - 2];

  // Büyütme modalı kendi seçimini bağımsız tutar (satır içi grafikle çakışmasın).
  const modalActiveIndex =
    modalSelectedIndex != null && modalSelectedIndex < values.length ? modalSelectedIndex : null;
  const modalCurrentValue =
    modalActiveIndex != null ? values[modalActiveIndex] : values[values.length - 1];
  const modalPreviousValue =
    modalActiveIndex != null ? values[modalActiveIndex - 1] : values[values.length - 2];
  const modalDelta =
    modalCurrentValue != null && modalPreviousValue != null
      ? Number((modalCurrentValue - modalPreviousValue).toFixed(1))
      : null;
  const modalIsGoodDelta =
    modalDelta != null && activeType
      ? activeType.target_direction === "decrease_is_good"
        ? modalDelta <= 0
        : modalDelta >= 0
      : true;
  // Seçili gün etiketi (yoksa "Son değer").
  const modalSelectedDate =
    modalActiveIndex != null ? series?.[modalActiveIndex]?.date ?? null : null;

  // Başka bir ölçüme geçilince önceki serinin seçili noktası anlamsız kalıyor.
  useEffect(() => {
    setSelectedIndex(null);
  }, [currentTypeId]);
  const delta = currentValue != null && previousValue != null ? Number((currentValue - previousValue).toFixed(1)) : null;
  const isGoodDelta =
    delta != null && activeType
      ? activeType.target_direction === "decrease_is_good"
        ? delta <= 0
        : delta >= 0
      : true;

  const currentStreak = (() => {
    if (!week) return 0;
    let streak = 0;
    for (let i = week.length - 1; i >= 0; i--) {
      if (week[i].isFuture) continue;
      if (week[i].type) streak++;
      else break;
    }
    return streak;
  })();

  const selectedSharePhoto = shareablePhotos?.find((photo) => photo.id === selectedSharePhotoId) ?? shareablePhotos?.[0] ?? null;

  useEffect(() => {
    if (shareablePhotos && shareablePhotos.length > 0) {
      const hasSelected = shareablePhotos.some((photo) => photo.id === selectedSharePhotoId);
      if (!hasSelected) {
        setSelectedSharePhotoId(shareablePhotos[0].id);
      }
    } else {
      setSelectedSharePhotoId(null);
    }
  }, [shareablePhotos, selectedSharePhotoId]);

  const { data: notifSettings } = useNotificationSettings(user?.id);

  async function handleShareCard(kind: "save" | "share") {
    if (!shareCardRef.current) {
      Alert.alert("Ön izleme hazır değil", "Kart henüz oluşturulmadı, lütfen tekrar dene.");
      return;
    }

    setSharePendingAction(kind);
    try {
      const uri = await captureRef(shareCardRef, { format: "png", quality: 1 });
      if (kind === "save") {
        if (!MediaLibrary) {
          Alert.alert(
            "Bu özellik Expo Go'da desteklenmiyor",
            "Galeriye kaydetmek için development build gerekiyor. Bu arada 'Paylaş' ile görseli doğrudan gönderebilirsin."
          );
          return;
        }
        // writeOnly=true: sadece galeriye yazıyoruz, tüm galeriye okuma izni gerekmiyor
        // (compare/index.tsx ile aynı yaklaşım — iOS "Yalnızca Fotoğraf Ekle").
        const { status } = await MediaLibrary.requestPermissionsAsync(true);
        if (status !== "granted") {
          Alert.alert("İzin gerekli", "Galeriye kaydetmek için fotoğraf erişim izni vermelisin.");
          return;
        }
        await MediaLibrary.saveToLibraryAsync(uri);
        Alert.alert("Kaydedildi", "Paylaşım kartı galerine kaydedildi.");
      } else {
        const available = await Sharing.isAvailableAsync();
        if (!available) {
          Alert.alert("Paylaşım desteklenmiyor", "Bu cihazda paylaşım özelliği kullanılamıyor.");
          return;
        }
        await Sharing.shareAsync(uri, { mimeType: "image/png" });
      }
    } catch (err) {
      Alert.alert(kind === "save" ? "Kaydetme başarısız" : "Paylaşım başarısız", (err as Error).message);
    } finally {
      setSharePendingAction(null);
    }
  }

  useEffect(() => {
    if (!week || !notifSettings?.streak_enabled) return;
    const today = week.find((d) => d.isToday);
    scheduleStreakRiskNotification(currentStreak, !!today?.type);
  }, [week, currentStreak, notifSettings?.streak_enabled]);

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerStyle={{ paddingTop: 56, paddingBottom: 32 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#8CE05A"
          colors={["#8CE05A"]}
        />
      }
    >
      <Text className="text-text text-3xl font-bold px-4 mb-4" accessibilityRole="header">
        İstatistikler
      </Text>

      {/* Antrenman sırasında hızlı erişim için ayrı kısayol: bugünün programını
          (set logger) doğrudan açar. Tarih vermiyoruz → varsayılan bugün. */}
      <Pressable
        onPress={() => router.push("/entry/program")}
        style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
        accessibilityRole="button"
        accessibilityLabel="Bugünün antrenman programını aç"
        className="mx-4 mb-4 bg-accentSoft border border-accent rounded-card p-4 flex-row items-center gap-3"
      >
        <View className="w-10 h-10 rounded-lg bg-accent/20 items-center justify-center">
          <Feather name="list" size={20} color="#8CE05A" />
        </View>
        <View className="flex-1">
          <Text className="text-text text-base font-semibold">Bugünün antrenmanı</Text>
          <Text className="text-textFaint text-sm">Programı yaz — hareket ve setleri ekle</Text>
        </View>
        <Feather name="chevron-right" size={18} color="#8CE05A" />
      </Pressable>

      <View className="flex-row gap-2 px-4 mb-4">
        {types?.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => setActiveTypeId(t.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: t.id === currentTypeId }}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            className={`px-4 py-3 rounded-pill ${t.id === currentTypeId ? "bg-accent" : "bg-surface"}`}
          >
            <Text className={`text-sm font-semibold capitalize ${t.id === currentTypeId ? "text-bg" : "text-textMuted"}`}>
              {t.name}
            </Text>
          </Pressable>
        ))}
      </View>

      <View className="mx-4 mb-4 bg-surface border border-border rounded-card p-4">
        {seriesLoading ? (
          <ActivityIndicator color="#8CE05A" />
        ) : values.length === 0 ? (
          <Text className="text-textMuted text-base">Bu ölçüm için henüz veri yok.</Text>
        ) : (
          <>
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-baseline gap-2">
                <Text className="text-text text-3xl font-bold">
                  {currentValue}{" "}
                  <Text className="text-base font-medium text-textMuted">{unitLabel}</Text>
                </Text>
                {delta != null ? (
                  <Text className={`text-sm font-semibold ${isGoodDelta ? "text-accent" : "text-danger"}`}>
                    {delta > 0 ? "↑" : delta < 0 ? "↓" : "•"} {Math.abs(delta)} {unitLabel}
                  </Text>
                ) : null}
              </View>

              <Pressable
                onPress={() => {
                  setModalSelectedIndex(selectedIndex);
                  setChartExpanded(true);
                }}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Grafiği büyüt"
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <Feather name="maximize-2" size={18} color="#8B8A82" />
              </Pressable>
            </View>

            <MeasurementChart
              values={values}
              series={series}
              unitLabel={unitLabel}
              height={CHART_H}
              selectedIndex={selectedIndex}
              onSelect={setSelectedIndex}
            />
          </>
        )}
      </View>

      {/* Büyütme modalı: aynı grafiği tam ekran, çok daha büyük çiziyor.
          Ekranda en fazla ~7 nokta görünür, gerisi yatay kaydırmayla gelir. */}
      <Modal
        visible={chartExpanded}
        transparent
        animationType="fade"
        onRequestClose={() => setChartExpanded(false)}
      >
        <View className="flex-1 bg-bg px-5 pt-16 pb-8">
          {/* Başlık: ölçüm adı + tarih aralığı, sağda kapat butonu */}
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-text text-2xl font-bold capitalize">{activeType?.name ?? ""}</Text>
              {series && series.length > 0 ? (
                <Text className="text-textFaint text-sm mt-1">
                  {new Date(series[0].date).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
                  {" – "}
                  {new Date(series[series.length - 1].date).toLocaleDateString("tr-TR", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={() => setChartExpanded(false)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Kapat"
              className="w-10 h-10 rounded-full bg-surface items-center justify-center"
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Feather name="x" size={22} color="#F5F3EC" />
            </Pressable>
          </View>

          {/* Büyük değer + trend + hangi güne ait */}
          <View className="mt-8">
            <View className="flex-row items-baseline gap-3">
              <Text className="text-text text-5xl font-bold">
                {modalCurrentValue}
                <Text className="text-xl font-medium text-textMuted"> {unitLabel}</Text>
              </Text>
              {modalDelta != null ? (
                <Text className={`text-base font-semibold ${modalIsGoodDelta ? "text-accent" : "text-danger"}`}>
                  {modalDelta > 0 ? "↑" : modalDelta < 0 ? "↓" : "•"} {Math.abs(modalDelta)} {unitLabel}
                </Text>
              ) : null}
            </View>
            <Text className="text-textFaint text-sm mt-1">
              {modalSelectedDate
                ? new Date(modalSelectedDate).toLocaleDateString("tr-TR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : "Son değer"}
            </Text>
          </View>

          {/* Grafik: dikeyde ortalanmış, ince bir yüzey çerçevesi içinde */}
          <View className="flex-1 justify-center">
            <View className="bg-surface border border-border rounded-card py-5 px-1">
              <MeasurementChart
                values={values}
                series={series}
                unitLabel={unitLabel}
                height={280}
                selectedIndex={modalSelectedIndex}
                onSelect={setModalSelectedIndex}
                scrollable
              />
            </View>
            {values.length > VISIBLE_POINTS ? (
              <Text className="text-textFaint text-xs text-center mt-3">
                ‹ tüm günleri görmek için kaydır ›
              </Text>
            ) : null}
          </View>
        </View>
      </Modal>

      <View className="mx-4 bg-surface border border-border rounded-card p-4">
        {/* Sol blok flex-1 + shrink: metinler taşmak yerine kısalsın. Sağdaki iki
            aksiyon eskiden tek satıra sığmıyordu (ikon + "X gün üst üste" + "Paylaş"
            + "Yıla göre gör" ≈ 435px, telefon ise 360-390px) ve kartın düzenini
            bozuyordu — "Paylaş" artık yalnızca ikon, etiketi erişilebilirlik
            tarafında duruyor. */}
        <View className="flex-row items-center justify-between mb-3 gap-2">
          <View className="flex-row items-center gap-3 flex-1 min-w-0">
            <View className="w-9 h-9 rounded-lg bg-stamp/15 items-center justify-center">
              <Feather name="zap" size={18} color="#FF7A3D" />
            </View>
            <View className="flex-1 min-w-0">
              <Text className="text-text text-base font-semibold" numberOfLines={1}>
                {currentStreak} gün üst üste
              </Text>
              <Text className="text-textFaint text-xs capitalize">bu hafta</Text>
            </View>
          </View>
          <View className="flex-row items-center gap-1 shrink-0">
            <Pressable
              onPress={() => setShareModalVisible(true)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Paylaşım kartı oluştur"
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              className="w-9 h-9 items-center justify-center"
            >
              <Feather name="share-2" size={17} color="#8CE05A" />
            </Pressable>
            <Pressable
              onPress={() => router.push("/calendar-year")}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Yıla göre gör"
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              className="flex-row items-center gap-1 py-2 pl-1"
            >
              <Text className="text-accent text-sm font-medium capitalize">Yıla göre gör</Text>
              <Feather name="chevron-right" size={15} color="#8CE05A" />
            </Pressable>
          </View>
        </View>

        {weekLoading ? (
          <ActivityIndicator color="#8CE05A" />
        ) : (
          <View className="flex-row justify-between">
            {week?.map((day) => {
              return (
                <Pressable
                  key={day.date}
                  onPress={() => handleDayPress(day)}
                  disabled={day.isFuture}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  accessibilityRole="button"
                  accessibilityLabel={dayAccessibilityLabel(day)}
                  accessibilityState={{ disabled: day.isFuture }}
                  style={({ pressed }) => ({ opacity: pressed && !day.isFuture ? 0.7 : 1 })}
                  className="items-center gap-1"
                >
                  <View
                    className={`w-8 h-8 rounded-md items-center justify-center ${
                      day.type === "log"
                        ? "bg-accent"
                        : day.type === "off_day"
                        ? "bg-offDaySoft border border-offDay"
                        : day.type === "workout"
                        ? "bg-accentSoft border border-accent"
                        : day.isFuture
                        ? "bg-transparent"
                        : day.isToday
                        ? "bg-accentSoft border border-dashed border-accent"
                        : "bg-white/5 border border-dashed border-white/20"
                    }`}
                  >
                    {day.type === "log" ? (
                      <Feather name="zap" size={14} color="#0B0D0A" />
                    ) : day.type === "off_day" ? (
                      <Feather name="moon" size={14} color="#B8C0E0" />
                    ) : day.type === "workout" ? (
                      <Feather name="check" size={14} color="#8CE05A" />
                    ) : null}
                  </View>
                  <Text className={`text-xs ${day.isFuture ? "text-textFaint/40" : "text-textFaint"}`}>
                    {day.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      <Modal transparent visible={shareModalVisible} animationType="slide" onRequestClose={() => setShareModalVisible(false)}>
        <View className="flex-1 bg-black/70 justify-end">
          <View className="bg-bg rounded-t-[28px] border-t border-border p-4 max-h-[92%]">
            <View className="flex-row items-start justify-between mb-4">
              <View className="flex-1 pr-3">
                <Text className="text-text text-lg font-semibold">Remory serisini paylaş</Text>
                <Text className="text-textFaint text-sm mt-1">
                  Bir fotoğraf seç — serin karta otomatik eklenir, indirip paylaşabilirsin.
                </Text>
              </View>
              <Pressable onPress={() => setShareModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Feather name="x" size={20} color="#F5F3EC" />
              </Pressable>
            </View>

            {sharePhotosLoading ? (
              <ActivityIndicator color="#8CE05A" className="my-6" />
            ) : shareablePhotos && shareablePhotos.length > 0 ? (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
                <View className="mb-4">
                  <Text className="text-text text-sm font-semibold mb-2">Fotoğraf seç</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                    {shareablePhotos.map((photo) => {
                      const isActive = selectedSharePhotoId === photo.id;
                      return (
                        <Pressable
                          key={photo.id}
                          onPress={() => setSelectedSharePhotoId(photo.id)}
                          className={`rounded-[16px] overflow-hidden border ${isActive ? "border-accent" : "border-border"}`}
                        >
                          <Image source={{ uri: photo.photoUrl! }} style={{ width: 90, height: 90 }} resizeMode="cover" />
                          <View className="px-2 py-1 bg-surface">
                            <Text className="text-textFaint text-xs">{new Date(photo.date).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}</Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>

                <View className="mb-4 rounded-card border border-border bg-surface p-3">
                  <View ref={shareCardRef} collapsable={false} className="rounded-[24px] overflow-hidden bg-[#0B0D0A]" style={{ minHeight: 420 }}>
                    <View className="absolute inset-0">
                      {selectedSharePhoto?.photoUrl ? (
                        <Image source={{ uri: selectedSharePhoto.photoUrl }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                      ) : (
                        <View className="w-full h-full bg-white/10 items-center justify-center">
                          <Text className="text-textMuted text-sm">Fotoğraf yok</Text>
                        </View>
                      )}
                      <View className="absolute inset-0 bg-black/35" />
                    </View>

                    <View className="absolute inset-x-0 bottom-0 p-5 items-center">
                      {/* Seri rozetini yalnızca gerçekten devam eden bir seri varsa göster.
                          Önceden Math.max(1, ...) ile taban 1'e sabitlenmişti; serisi olmayan
                          kullanıcı için bile "1 gün üst üste" yazıyor, yani dışarıya paylaşılan
                          görselde var olmayan bir seri iddia ediliyordu. */}
                      {currentStreak > 0 ? (
                        <View className="rounded-full border border-white/20 bg-black/55 px-4 py-2 mb-3">
                          <Text className="text-white text-xl font-bold text-center">{currentStreak} gün üst üste</Text>
                        </View>
                      ) : null}
                      <View className="flex-row items-center gap-2 rounded-full border border-white/20 bg-black/55 px-3 py-2">
                        <View className="w-8 h-8 rounded-full bg-accent/20 items-center justify-center border border-accent/30">
                          <Text className="text-accent font-bold text-sm">R</Text>
                        </View>
                        <Text className="text-white text-sm font-semibold">remory</Text>
                      </View>
                    </View>
                  </View>
                </View>

                <View className="flex-row gap-2">
                  <Pressable
                    onPress={() => handleShareCard("save")}
                    disabled={sharePendingAction !== null}
                    style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                    className="flex-1 flex-row items-center justify-center gap-2 border border-border rounded-[12px] py-3 bg-surface"
                  >
                    {sharePendingAction === "save" ? (
                      <ActivityIndicator size="small" color="#F5F3EC" />
                    ) : (
                      <>
                        <Feather name="download" size={16} color="#F5F3EC" />
                        <Text className="text-text text-sm font-semibold">İndir</Text>
                      </>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={() => handleShareCard("share")}
                    disabled={sharePendingAction !== null}
                    style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                    className="flex-1 flex-row items-center justify-center gap-2 border border-accent rounded-[12px] py-3 bg-accentSoft"
                  >
                    {sharePendingAction === "share" ? (
                      <ActivityIndicator size="small" color="#8CE05A" />
                    ) : (
                      <>
                        <Feather name="share-2" size={16} color="#8CE05A" />
                        <Text className="text-accent text-sm font-semibold">Paylaş</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </ScrollView>
            ) : (
              <View className="py-6">
                <Text className="text-textMuted text-base text-center">
                  Henüz paylaşılacak fotoğraf yok. Önce bir kayıt fotoğrafı ekle.
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
